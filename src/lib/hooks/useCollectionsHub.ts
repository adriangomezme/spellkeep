import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@powersync/react';
import { batchResolveBySupabaseId } from '../catalog/catalogQueries';
import { resolveCardsBySupabaseId } from '../catalog/resolveFromSupabase';
import { subscribePriceOverrides } from '../pricing/priceOverrides';
import { writeCollectionStatsCache } from './useCollectionStatsCache';
import type {
  CollectionSummary,
  CollectionType,
  FolderSummary,
  OwnedCardStats,
} from '../collections';
import type { ScryfallCard } from '../scryfall';

// ─────────────────────────────────────────────────────────────────────────
// Local-first hub state.
//
// Reads (no server round-trips for counts or values):
//   • Per-collection counts come from a single SQL aggregate against
//     the local collection_cards table.
//   • Per-collection $ value is computed from the same table + prices
//     batch-resolved from catalog.db (fallback Supabase for any card
//     missing from the daily snapshot). A price override tick forces
//     a revalidation so "Update now" reflects immediately.
//
// RAM discipline: the price cache is bounded by CACHE_CAP so a user with
// 100k unique owned cards doesn't sit on 300 MB of JS objects. Counts are
// derived purely from SQL so they're O(SQL) regardless of collection size.
// ─────────────────────────────────────────────────────────────────────────

// LRU is a cross-render accelerator only — the actual priceMap that the
// hub renders with is built per-resultset and not bounded by this cap, so
// a user with 100k uniques never has rows silently dropped. The cap
// strictly protects long-session RAM.
const CACHE_CAP = 20000;

type LocalFolderRow = {
  id: string;
  name: string;
  type: CollectionType;
  color: string | null;
  item_count: number;
};

type CollectionRow = {
  id: string;
  name: string;
  type: CollectionType;
  folder_id: string | null;
  color: string | null;
};

type CountRow = {
  collection_id: string;
  card_count: number;
  unique_cards: number;
};

type ValueRow = {
  collection_id: string;
  card_id: string;
  qty_normal: number;
  qty_foil: number;
  qty_etched: number;
};

type PriceRow = {
  price_usd: number | null;
  price_usd_foil: number | null;
};

class PriceCache {
  private map = new Map<string, PriceRow>();
  constructor(private cap: number) {}
  get(id: string): PriceRow | undefined {
    const v = this.map.get(id);
    if (v !== undefined) {
      this.map.delete(id);
      this.map.set(id, v);
    }
    return v;
  }
  set(id: string, value: PriceRow): void {
    if (this.map.has(id)) this.map.delete(id);
    this.map.set(id, value);
    while (this.map.size > this.cap) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
  has(id: string): boolean {
    return this.map.has(id);
  }
  clear(): void {
    this.map.clear();
  }
}

function toPriceRow(card: ScryfallCard): PriceRow {
  const usd = card.prices?.usd ? Number(card.prices.usd) : null;
  const foil = card.prices?.usd_foil ? Number(card.prices.usd_foil) : null;
  return {
    price_usd: Number.isFinite(usd as number) ? usd : null,
    price_usd_foil: Number.isFinite(foil as number) ? foil : null,
  };
}

export function useCollectionsHub() {
  const folderRows = useQuery<LocalFolderRow>(
    `SELECT f.id, f.name, f.type, f.color,
            (SELECT COUNT(*) FROM collections c WHERE c.folder_id = f.id) AS item_count
       FROM collection_folders f
      ORDER BY LOWER(f.name)`
  );
  const collectionRows = useQuery<CollectionRow>(
    `SELECT id, name, type, folder_id, color
       FROM collections
      ORDER BY LOWER(name)`
  );

  // Per-collection counts via SQL aggregate. Unique cards = distinct
  // print × finish variants, matching the server RPC definition so numbers
  // agree with binder detail / export history / etc.
  const countRows = useQuery<CountRow>(
    `SELECT cc.collection_id,
            SUM(cc.quantity_normal + cc.quantity_foil + cc.quantity_etched) AS card_count,
            SUM(CASE WHEN cc.quantity_normal > 0 THEN 1 ELSE 0 END)
          + SUM(CASE WHEN cc.quantity_foil > 0 THEN 1 ELSE 0 END)
          + SUM(CASE WHEN cc.quantity_etched > 0 THEN 1 ELSE 0 END) AS unique_cards
       FROM collection_cards cc
      GROUP BY cc.collection_id`
  );

  // Grouped rows needed for $ value: quantity × price per (collection, card).
  // Only pulls as many tuples as there are distinct (card, collection) pairs.
  const valueRows = useQuery<ValueRow>(
    `SELECT cc.collection_id,
            cc.card_id,
            SUM(cc.quantity_normal) AS qty_normal,
            SUM(cc.quantity_foil)   AS qty_foil,
            SUM(cc.quantity_etched) AS qty_etched
       FROM collection_cards cc
      GROUP BY cc.collection_id, cc.card_id`
  );

  // Owned = across-binders de-duplicated by (card_id, condition, language).
  // Must be computed as a separate merged aggregation, not a sum of
  // per-binder counts, so a card shared between two binders counts once
  // toward unique.
  const ownedRows = useQuery<{
    card_id: string;
    qty_normal: number;
    qty_foil: number;
    qty_etched: number;
  }>(
    `SELECT cc.card_id,
            SUM(cc.quantity_normal) AS qty_normal,
            SUM(cc.quantity_foil)   AS qty_foil,
            SUM(cc.quantity_etched) AS qty_etched
       FROM collection_cards cc
       JOIN collections c ON cc.collection_id = c.id
      WHERE c.type = 'binder'
      GROUP BY cc.card_id, cc.condition, cc.language`
  );

  const countsById = useMemo(() => {
    const m = new Map<string, CountRow>();
    for (const r of countRows.data ?? []) m.set(r.collection_id, r);
    return m;
  }, [countRows.data]);

  // Fallback counts from the persistent cache so re-opening the app or
  // entering a folder for the first time doesn't flash "0 Cards · 0
  // unique" on each binder row while the live aggregate is computing.
  // When the live aggregate catches up, it overrides (useMemo below).
  const cachedStatsRows = useQuery<{
    collection_id: string;
    card_count: number;
    unique_cards: number;
    total_value: number;
  }>(
    `SELECT collection_id, card_count, unique_cards, total_value
       FROM collection_stats_cache`
  );
  const cachedStatsById = useMemo(() => {
    const m = new Map<string, { card_count: number; unique_cards: number; total_value: number }>();
    for (const r of cachedStatsRows.data ?? []) {
      m.set(r.collection_id, {
        card_count: Number(r.card_count ?? 0),
        unique_cards: Number(r.unique_cards ?? 0),
        total_value: Number(r.total_value ?? 0),
      });
    }
    return m;
  }, [cachedStatsRows.data]);

  const priceCacheRef = useRef(new PriceCache(CACHE_CAP));
  const [priceMap, setPriceMap] = useState<Map<string, PriceRow>>(new Map());
  const [priceTick, setPriceTick] = useState(0);

  useEffect(() => subscribePriceOverrides(() => setPriceTick((n) => n + 1)), []);

  // Distinct card_ids referenced across all collections. We batch-resolve
  // these against the local catalog, falling back to Supabase only for
  // rows added after the last snapshot.
  const distinctCardIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of valueRows.data ?? []) s.add(r.card_id);
    return s;
  }, [valueRows.data]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (distinctCardIds.size === 0) {
        if (!cancelled) setPriceMap(new Map());
        return;
      }

      // Build the full snapshot from the LRU first — rows we've already
      // priced keep their value while we run down the cache misses. The
      // snap map is INDEPENDENT of the LRU cap so a 100k-card collection
      // doesn't lose rows to eviction mid-resolve.
      const snap = new Map<string, PriceRow>();
      for (const id of distinctCardIds) {
        const hit = priceTick === 0 ? priceCacheRef.current.get(id) : undefined;
        if (hit) snap.set(id, hit);
      }

      // Publish the partial snapshot so any cards already priced show
      // immediately; the remaining ones backfill as the catalog loop
      // progresses.
      if (snap.size > 0 && !cancelled) setPriceMap(new Map(snap));

      const needFromLocal = priceTick === 0
        ? Array.from(distinctCardIds).filter((id) => !snap.has(id))
        : Array.from(distinctCardIds);

      try {
        if (needFromLocal.length > 0) {
          const local = await batchResolveBySupabaseId(needFromLocal);
          for (const [id, card] of local) {
            const price = toPriceRow(card);
            snap.set(id, price);
            priceCacheRef.current.set(id, price);
          }
          if (!cancelled) setPriceMap(new Map(snap));
        }

        const stillMissing = Array.from(distinctCardIds).filter((id) => !snap.has(id));
        if (stillMissing.length > 0) {
          const remote = await resolveCardsBySupabaseId(stillMissing);
          for (const [id, card] of remote) {
            const price = toPriceRow(card);
            snap.set(id, price);
            priceCacheRef.current.set(id, price);
          }
          if (!cancelled) setPriceMap(new Map(snap));
        }
      } catch (err) {
        console.warn('[useCollectionsHub] price resolve failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [distinctCardIds, priceTick]);

  // Walk the grouped value rows once and accumulate $ per collection.
  // This is O(rows) where rows = distinct (collection, card) pairs —
  // fine at 100k total card_ids because the map has ~30-50k buckets.
  const valueByCollection = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of valueRows.data ?? []) {
      const price = priceMap.get(r.card_id);
      if (!price) continue;
      let v = m.get(r.collection_id) ?? 0;
      if (price.price_usd != null) v += price.price_usd * (r.qty_normal ?? 0);
      if (price.price_usd_foil != null) v += price.price_usd_foil * (r.qty_foil ?? 0);
      const etched = price.price_usd_foil ?? price.price_usd;
      if (etched != null) v += etched * (r.qty_etched ?? 0);
      m.set(r.collection_id, v);
    }
    return m;
  }, [valueRows.data, priceMap]);

  const liveCountsReady = countRows.data !== undefined;

  const enrich = (row: CollectionRow): CollectionSummary => {
    const live = countsById.get(row.id);
    const cached = cachedStatsById.get(row.id);

    // statsReady = we have per-collection numbers to show. A collection
    // that just got created by a duplicate/import won't show up in the
    // live aggregate until ALL its child rows have streamed down — if
    // we used a global "liveReady" flag the row would flash
    // "0 Cards · 0 unique" for 1-5 s. Per-collection: we only claim
    // ready when we actually have numbers (live OR cached).
    const statsReady = live != null || cached != null;

    const card_count = live != null
      ? Number(live.card_count ?? 0)
      : (cached?.card_count ?? 0);
    const unique_cards = live != null
      ? Number(live.unique_cards ?? 0)
      : (cached?.unique_cards ?? 0);

    // Value: the live path depends on catalog enrichment, which is
    // always later than counts. Prefer live when it's non-zero; else
    // show the cached number so the header doesn't flash $0.00.
    const liveValue = valueByCollection.get(row.id) ?? 0;
    const total_value = liveValue > 0 ? liveValue : (cached?.total_value ?? 0);

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      folder_id: row.folder_id,
      color: row.color,
      card_count,
      unique_cards,
      total_value,
      statsReady,
    };
  };

  const binders: CollectionSummary[] = useMemo(
    () => (collectionRows.data ?? []).filter((c) => c.type === 'binder').map(enrich),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collectionRows.data, countsById, valueByCollection, cachedStatsById, liveCountsReady]
  );
  const lists: CollectionSummary[] = useMemo(
    () => (collectionRows.data ?? []).filter((c) => c.type === 'list').map(enrich),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collectionRows.data, countsById, valueByCollection, cachedStatsById, liveCountsReady]
  );

  // Write each collection's freshly-computed stats back to the local
  // cache table so reopening the app — or entering any folder — shows
  // the right numbers on the very first frame instead of a "0 / 0 / $0"
  // blink. Skipped until the live aggregates are ready AND prices have
  // resolved (otherwise we'd pollute the cache with half-computed
  // zeroes). Throttled to once per collection per meaningful change.
  const lastWrittenRef = useRef(new Map<string, string>());
  useEffect(() => {
    if (!liveCountsReady) return;
    const allCollections = [...binders, ...lists];
    if (allCollections.length === 0) return;
    for (const c of allCollections) {
      const signature = `${c.card_count}|${c.unique_cards}|${c.total_value}`;
      if (lastWrittenRef.current.get(c.id) === signature) continue;
      // Don't cache trivial "just counted zeros". Zero is a real state
      // when the collection is genuinely empty; we just don't want the
      // first-emit-before-prices state to get persisted.
      if (c.card_count === 0 && c.unique_cards === 0 && c.total_value === 0) {
        continue;
      }
      lastWrittenRef.current.set(c.id, signature);
      writeCollectionStatsCache(c.id, {
        card_count: c.card_count,
        unique_cards: c.unique_cards,
        total_value: c.total_value,
      }).catch(() => {});
    }
  }, [binders, lists, liveCountsReady]);

  const binderFolders: FolderSummary[] = useMemo(
    () => (folderRows.data ?? []).filter((f) => f.type === 'binder'),
    [folderRows.data]
  );
  const listFolders: FolderSummary[] = useMemo(
    () => (folderRows.data ?? []).filter((f) => f.type === 'list'),
    [folderRows.data]
  );

  // Owned stats: iterate the merged aggregation rows (same dedup that
  // the server RPC used) and compute total / unique / value. Totals
  // don't double-count a card that lives in multiple binders.
  const ownedStats: OwnedCardStats = useMemo(() => {
    let total = 0;
    let unique = 0;
    let value = 0;
    for (const r of ownedRows.data ?? []) {
      const qn = Number(r.qty_normal ?? 0);
      const qf = Number(r.qty_foil ?? 0);
      const qe = Number(r.qty_etched ?? 0);
      total += qn + qf + qe;
      if (qn > 0) unique += 1;
      if (qf > 0) unique += 1;
      if (qe > 0) unique += 1;
      const price = priceMap.get(r.card_id);
      if (!price) continue;
      if (price.price_usd != null) value += price.price_usd * qn;
      if (price.price_usd_foil != null) value += price.price_usd_foil * qf;
      const etched = price.price_usd_foil ?? price.price_usd;
      if (etched != null) value += etched * qe;
    }
    return { total_cards: total, unique_cards: unique, total_value: value };
  }, [ownedRows.data, priceMap]);

  // Revalidate is now a no-op: useQuery keeps everything reactive. Kept
  // so screens that imported it don't need to change their wiring.
  const revalidate = () => {};

  return {
    binders,
    lists,
    binderFolders,
    listFolders,
    ownedStats,
    revalidate,
  };
}
