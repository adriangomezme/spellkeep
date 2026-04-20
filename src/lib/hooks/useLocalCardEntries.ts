import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@powersync/react';
import { batchResolveBySupabaseId } from '../catalog/catalogQueries';
import { resolveCardsBySupabaseId } from '../catalog/resolveFromSupabase';
import { subscribePriceOverrides } from '../pricing/priceOverrides';
import type { ScryfallCard } from '../scryfall';

// ─────────────────────────────────────────────────────────────────────────
// Local card entries (binder/list detail + owned view)
//
// PowerSync and catalog.db are separate SQLite files, so we can't JOIN in
// one query. The flow is:
//   1. `useQuery` watches collection_cards for the scoped rows.
//   2. A batched lookup against catalog.db enriches each row with its
//      catalog card (the ScryfallCard-shaped output).
//   3. Cards missing from the local snapshot (e.g. Japanese printings
//      added after the last daily snapshot) fall back to Supabase. Same
//      shape, merged into the same cache.
//   4. Price override subscription triggers a lightweight revalidation.
//
// Two-level cache:
//   • cardMap (per-resultset): holds every card in the CURRENT binder/
//     owned view. Must be complete so the FlatList can render every row —
//     if we filter this by an LRU we end up with blank cards when the
//     collection is larger than the cap.
//   • cacheRef (cross-screen LRU): pure query-skipping acceleration. If
//     a card was resolved on a previous screen it doesn't hit catalog.db
//     again. LRU eviction is fine here because a miss just means a
//     re-query, never a blank render.
// ─────────────────────────────────────────────────────────────────────────

const LRU_CAP = 20000;

type RawRow = {
  id: string;
  collection_id: string;
  card_id: string;
  condition: string | null;
  language: string | null;
  quantity_normal: number | null;
  quantity_foil: number | null;
  quantity_etched: number | null;
  added_at: string;
};

export type EnrichedEntry = {
  id: string;
  collection_id: string;
  card_id: string;
  condition: string;
  language: string;
  added_at: string;
  quantity_normal: number;
  quantity_foil: number;
  quantity_etched: number;
  cards: {
    id: string;
    scryfall_id: string;
    oracle_id: string;
    name: string;
    set_name: string;
    set_code: string;
    collector_number: string;
    rarity: string;
    type_line: string;
    cmc: number | null;
    is_legendary: number | null;
    image_uri_small: string;
    image_uri_normal: string;
    price_usd: number | null;
    price_usd_foil: number | null;
    color_identity: string[];
    layout?: string;
    artist?: string;
  };
};

// Simple LRU: a plain Map preserves insertion order. On read we delete +
// re-insert to bump the key; on overflow we evict the oldest (first) key.
class LRU<K, V> {
  private map = new Map<K, V>();
  constructor(private cap: number) {}

  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.cap) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
  has(key: K): boolean {
    return this.map.has(key);
  }
  keys(): K[] {
    return Array.from(this.map.keys());
  }
  snapshot(keysWanted: Iterable<K>): Map<K, V> {
    const out = new Map<K, V>();
    for (const k of keysWanted) {
      const v = this.map.get(k);
      if (v !== undefined) out.set(k, v);
    }
    return out;
  }
  clear(): void {
    this.map.clear();
  }
}

function cardShape(card_id: string, card: ScryfallCard | undefined): EnrichedEntry['cards'] {
  if (!card) {
    return {
      id: card_id,
      scryfall_id: '',
      oracle_id: '',
      name: '',
      set_name: '',
      set_code: '',
      collector_number: '',
      rarity: '',
      type_line: '',
      cmc: null,
      is_legendary: null,
      image_uri_small: '',
      image_uri_normal: '',
      price_usd: null,
      price_usd_foil: null,
      color_identity: [],
    };
  }
  const priceUsd = card.prices?.usd ? Number(card.prices.usd) : null;
  const priceUsdFoil = card.prices?.usd_foil ? Number(card.prices.usd_foil) : null;
  return {
    id: card_id,
    scryfall_id: card.id,
    oracle_id: card.oracle_id ?? '',
    name: card.name,
    set_name: card.set_name,
    set_code: card.set,
    collector_number: card.collector_number,
    rarity: card.rarity,
    type_line: card.type_line,
    cmc: card.cmc ?? null,
    is_legendary: card.type_line?.toLowerCase().includes('legendary') ? 1 : 0,
    image_uri_small: card.image_uris?.small ?? '',
    image_uri_normal: card.image_uris?.normal ?? card.image_uris?.small ?? '',
    price_usd: Number.isFinite(priceUsd as number) ? priceUsd : null,
    price_usd_foil: Number.isFinite(priceUsdFoil as number) ? priceUsdFoil : null,
    color_identity: card.color_identity ?? [],
    layout: card.layout,
    artist: card.artist,
  };
}

function normalize(row: RawRow): RawRow {
  return {
    ...row,
    condition: row.condition ?? 'near_mint',
    language: row.language ?? 'en',
    quantity_normal: row.quantity_normal ?? 0,
    quantity_foil: row.quantity_foil ?? 0,
    quantity_etched: row.quantity_etched ?? 0,
  };
}

type Options = {
  /** SQL fragment appended after WHERE. Example: `collection_id = ?`. */
  where: string;
  /** Positional params for the WHERE fragment. */
  params: any[];
};

/**
 * Shared core hook: watches `collection_cards` filtered by a WHERE fragment
 * and returns rows enriched with their catalog card. Callers above (binder
 * detail, owned view) supply the filter; the hook doesn't know about
 * scoping.
 */
export function useLocalCardEntries({ where, params }: Options): {
  entries: EnrichedEntry[];
  isInitializing: boolean;
} {
  const rows = useQuery<RawRow>(
    `SELECT id, collection_id, card_id, condition, language,
            quantity_normal, quantity_foil, quantity_etched, added_at
       FROM collection_cards
      WHERE ${where}
      ORDER BY added_at DESC, id DESC`,
    params
  );

  const normalizedRows = useMemo(
    () => (rows.data ?? []).map(normalize),
    [rows.data]
  );

  const [cardMap, setCardMap] = useState<Map<string, ScryfallCard>>(new Map());
  const [hasResolvedOnce, setHasResolvedOnce] = useState(false);
  const [priceTick, setPriceTick] = useState(0);
  const cacheRef = useRef<LRU<string, ScryfallCard>>(new LRU(LRU_CAP));

  useEffect(() => subscribePriceOverrides(() => setPriceTick((n) => n + 1)), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const wanted = new Set<string>();
      for (const r of normalizedRows) wanted.add(r.card_id);

      if (wanted.size === 0) {
        if (!cancelled) {
          setCardMap(new Map());
          setHasResolvedOnce(true);
        }
        return;
      }

      // Build the full snapshot for this resultset from the LRU first so
      // rows we've seen on other screens paint immediately.
      const snap = new Map<string, ScryfallCard>();
      for (const id of wanted) {
        const hit = priceTick === 0 ? cacheRef.current.get(id) : undefined;
        if (hit) snap.set(id, hit);
      }

      // Everything the LRU didn't answer (plus, on a price tick, the
      // entire set so stale prices get replaced) goes to catalog.db.
      const needFromLocal = priceTick === 0
        ? Array.from(wanted).filter((id) => !snap.has(id))
        : Array.from(wanted);

      // Paint partial results as we progress so huge binders don't stay
      // blank while the catalog loop runs through 50+ query batches. We
      // only publish once per resolution stage to keep re-renders cheap.
      if (snap.size > 0 && !cancelled) {
        setCardMap(new Map(snap));
        setHasResolvedOnce(true);
      }

      try {
        if (needFromLocal.length > 0) {
          const local = await batchResolveBySupabaseId(needFromLocal);
          for (const [id, card] of local) {
            snap.set(id, card);
            cacheRef.current.set(id, card);
          }
          if (!cancelled) {
            setCardMap(new Map(snap));
            setHasResolvedOnce(true);
          }
        }

        // Remaining misses = rows added after the last catalog snapshot.
        // Fall back to Supabase so the UI never silently renders blanks.
        const stillMissing = Array.from(wanted).filter((id) => !snap.has(id));
        if (stillMissing.length > 0) {
          const remote = await resolveCardsBySupabaseId(stillMissing);
          for (const [id, card] of remote) {
            snap.set(id, card);
            cacheRef.current.set(id, card);
          }
          if (!cancelled) {
            setCardMap(new Map(snap));
          }
        }

        if (!cancelled) setHasResolvedOnce(true);
      } catch (err) {
        console.warn('[useLocalCardEntries] enrichment failed', err);
        if (!cancelled) setHasResolvedOnce(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [normalizedRows, priceTick]);

  const entries = useMemo<EnrichedEntry[]>(() => {
    return normalizedRows.map((r) => ({
      id: r.id,
      collection_id: r.collection_id,
      card_id: r.card_id,
      condition: r.condition ?? 'near_mint',
      language: r.language ?? 'en',
      added_at: r.added_at,
      quantity_normal: r.quantity_normal ?? 0,
      quantity_foil: r.quantity_foil ?? 0,
      quantity_etched: r.quantity_etched ?? 0,
      cards: cardShape(r.card_id, cardMap.get(r.card_id)),
    }));
  }, [normalizedRows, cardMap]);

  // isInitializing = the hook hasn't finished its first enrichment pass
  // AND the useQuery is still producing data. Once either the first pass
  // completes OR useQuery confirms the collection is empty, we flip it
  // off so the screen can render the real content (or the empty state).
  const isInitializing = !hasResolvedOnce && (normalizedRows.length > 0 || rows.isLoading === true);

  return { entries, isInitializing };
}
