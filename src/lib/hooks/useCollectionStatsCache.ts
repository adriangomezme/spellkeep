import { useEffect } from 'react';
import { useQuery } from '@powersync/react';
import { db } from '../powersync/system';

// Persistent per-collection stats cache (local-only table).
// Lets the binder/list/owned headers paint their counts AND $ value on
// the very first frame after opening — the value comes from the last
// enrichment pass, so while the current pass catches up there's no
// misleading "$0.00" flash. The cache is re-written when an enrichment
// finishes with a fresh value.

export type CachedStats = {
  card_count: number;
  unique_cards: number;
  total_value: number;
  updated_at: string;
};

export function useCachedCollectionStats(collectionId: string | undefined): CachedStats | null {
  const rows = useQuery<CachedStats>(
    `SELECT card_count, unique_cards, total_value, updated_at
       FROM collection_stats_cache
      WHERE collection_id = ?
      LIMIT 1`,
    [collectionId ?? '']
  );
  return rows.data?.[0] ?? null;
}

export async function writeCollectionStatsCache(
  collectionId: string,
  stats: { card_count: number; unique_cards: number; total_value: number }
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT OR REPLACE INTO collection_stats_cache
       (id, collection_id, card_count, unique_cards, total_value, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [collectionId, collectionId, stats.card_count, stats.unique_cards, stats.total_value, now]
  );
}

/**
 * Hook version of the writer: fires once per meaningful stat change
 * while the caller is mounted. No-op for undefined/empty collectionId.
 */
export function useWriteCollectionStatsCache(
  collectionId: string | undefined,
  shouldWrite: boolean,
  stats: { card_count: number; unique_cards: number; total_value: number }
): void {
  useEffect(() => {
    if (!collectionId || !shouldWrite) return;
    // Skip trivial updates (all zeros) — those usually mean enrichment
    // hasn't completed; we don't want to overwrite a good cache with
    // noise.
    if (stats.card_count === 0 && stats.unique_cards === 0) return;
    writeCollectionStatsCache(collectionId, stats).catch((err) => {
      console.warn('[writeCollectionStatsCache] failed', err);
    });
  }, [collectionId, shouldWrite, stats.card_count, stats.unique_cards, stats.total_value]);
}
