import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@powersync/react';
import { batchResolveBySupabaseId } from '../catalog/catalogQueries';
import { resolveCardsBySupabaseId } from '../catalog/resolveFromSupabase';
import { subscribePriceOverrides } from '../pricing/priceOverrides';
import type { ScryfallCard } from '../scryfall';

// ─────────────────────────────────────────────────────────────────────────
// Local card entries (binder/list detail + owned view)
//
// Non-blocking design: the hook NEVER makes the UI wait for enrichment.
//   1. `useQuery` emits rows from local SQLite — typically sub-5ms.
//   2. Rows render immediately with a placeholder card shape. The grid /
//      list shows the right COUNT of cards right away (with the bundled
//      CardImage placeholder) — no "No cards yet" empty state, no
//      spinner.
//   3. Enrichment runs in chunked batches in the background. Each chunk
//      that resolves pushes a fresh cardMap so the UI progressively
//      fills in names, prices, and real images.
//
// The `isReady` flag is purely informational — signals that enrichment
// has finished for the current resultset — so screens can gate secondary
// decorations (e.g. hide the `$X.XX` in the header until prices land).
// It is NOT used to gate rendering of the list itself.
// ─────────────────────────────────────────────────────────────────────────

const LRU_CAP = 20000;
// Size of each catalog.db batch. 400 is below SQLite's default
// SQLITE_MAX_VARIABLE_NUMBER (999). We could go higher with a newer
// SQLite build but staying conservative keeps behavior portable.
const ENRICH_CHUNK = 400;

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
    price_usd_etched: number | null;
    color_identity: string[];
    layout?: string;
    artist?: string;
  };
};

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
}

// Module-level LRU so cross-hook usage (binder + owned + hub) shares
// already-resolved cards instead of re-querying catalog.db.
const cardCache = new LRU<string, ScryfallCard>(LRU_CAP);

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
      price_usd_etched: null,
      color_identity: [],
    };
  }
  const priceUsd = card.prices?.usd ? Number(card.prices.usd) : null;
  const priceUsdFoil = card.prices?.usd_foil ? Number(card.prices.usd_foil) : null;
  const priceUsdEtched = card.prices?.usd_etched ? Number(card.prices.usd_etched) : null;
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
    price_usd_etched: Number.isFinite(priceUsdEtched as number) ? priceUsdEtched : null,
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
  where: string;
  params: any[];
};

export function useLocalCardEntries({ where, params }: Options): {
  entries: EnrichedEntry[];
  isReady: boolean;
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

  // cardMap is a rev-counter map. Instead of storing per-entry,
  // cardShape() pulls from cardCache at render time. We bump `tick` to
  // invalidate memos after each enrichment chunk lands.
  const [tick, setTick] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [priceTick, setPriceTick] = useState(0);

  useEffect(() => subscribePriceOverrides(() => setPriceTick((n) => n + 1)), []);

  const rowsSignature = useMemo(() => {
    if (normalizedRows.length === 0) return 'empty';
    const first = normalizedRows[0];
    const last = normalizedRows[normalizedRows.length - 1];
    return `${normalizedRows.length}|${first.id}|${last.id}`;
  }, [normalizedRows]);

  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  useEffect(() => {
    // Cancel any in-flight enrichment from the previous resultset.
    cancelRef.current.cancelled = true;
    const self = { cancelled: false };
    cancelRef.current = self;

    if (normalizedRows.length === 0) {
      setIsReady(true);
      return;
    }

    setIsReady(false);
    // Scan the row set once to figure out which card ids still need
    // resolving from catalog.db. Cached hits are skipped entirely
    // unless a price override forced a re-resolve (priceTick > 0
    // compared to last time it ran).
    const wanted = new Set<string>();
    for (const r of normalizedRows) wanted.add(r.card_id);

    const needFetch: string[] = [];
    for (const id of wanted) {
      if (priceTick > 0) {
        needFetch.push(id);
      } else if (!cardCache.has(id)) {
        needFetch.push(id);
      }
    }

    if (needFetch.length === 0) {
      setIsReady(true);
      return;
    }

    (async () => {
      try {
        for (let i = 0; i < needFetch.length; i += ENRICH_CHUNK) {
          if (self.cancelled) return;
          const slice = needFetch.slice(i, i + ENRICH_CHUNK);
          const local = await batchResolveBySupabaseId(slice);
          for (const [id, card] of local) cardCache.set(id, card);
          if (!self.cancelled) setTick((t) => t + 1);
        }

        // Supabase fallback for rows added after the last catalog
        // snapshot. Typically a very small subset.
        const stillMissing = needFetch.filter((id) => !cardCache.has(id));
        if (stillMissing.length > 0 && !self.cancelled) {
          const remote = await resolveCardsBySupabaseId(stillMissing);
          for (const [id, card] of remote) cardCache.set(id, card);
          if (!self.cancelled) setTick((t) => t + 1);
        }

        if (!self.cancelled) setIsReady(true);
      } catch (err) {
        console.warn('[useLocalCardEntries] enrichment failed', err);
        if (!self.cancelled) setIsReady(true);
      }
    })();

    return () => {
      self.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsSignature, priceTick]);

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
      cards: cardShape(r.card_id, cardCache.get(r.card_id)),
    }));
    // `tick` invalidates this memo each time a chunk lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedRows, tick]);

  return { entries, isReady };
}
