import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { searchCards, type SearchSortKey, type ScryfallCard } from '../scryfall';

// Discovery bucket — DB-driven weekly themed search recommendations.
// One bucket is active per ISO week, rotating automatically based on
// the `active_from` / `active_until` window stored on the row. The
// app fetches the active bucket once per session (cached for 6h) and
// runs its `query` through `searchCards` (Scryfall first, local
// fallback). If the fetch or the query fails, the consuming UI hides
// the section silently — discovery is additive, never load-bearing.

export type DiscoveryBucket = {
  id: string;
  title: string;
  subtitle: string | null;
  icon: string;
  query: string;
  sort_by: BucketSort;
  active_from: string;
  active_until: string;
};

export type BucketSort =
  | 'edhrec_asc'
  | 'edhrec_desc'
  | 'released_desc'
  | 'released_asc'
  | 'price_asc'
  | 'price_desc';

export type WeeklyBucketResult = {
  bucket: DiscoveryBucket | null;
  cards: ScryfallCard[];
  loading: boolean;
};

// Cache for the lifetime of the JS bundle. Buckets only change weekly,
// so re-fetching on every Search-tab focus would be wasteful. The 6h
// staleness covers the worst case (user opens at 23:59 Sunday, the
// bucket flips at midnight, they reopen at 06:00 Monday and see the
// new pick).
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cache: { result: WeeklyBucketResult; fetchedAt: number } | null = null;
let inFlight: Promise<WeeklyBucketResult> | null = null;

async function fetchActiveBucket(): Promise<DiscoveryBucket | null> {
  // Local-date string in UTC so the comparison matches the
  // `active_from`/`active_until` `date` columns. We don't need
  // timezone-perfect rotation — being off by a few hours on a weekly
  // schedule is invisible to users.
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('discovery_buckets')
    .select('*')
    .lte('active_from', today)
    .gt('active_until', today)
    .order('active_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[useWeeklyBucket] fetch failed', error.message);
    return null;
  }
  return (data as DiscoveryBucket | null) ?? null;
}

function bucketSortToSearchKey(sort: BucketSort): {
  key: SearchSortKey;
  asc: boolean;
} {
  switch (sort) {
    case 'edhrec_asc':
      return { key: 'edhrec', asc: true };
    case 'edhrec_desc':
      return { key: 'edhrec', asc: false };
    case 'released_desc':
      return { key: 'released', asc: false };
    case 'released_asc':
      return { key: 'released', asc: true };
    case 'price_asc':
      return { key: 'usd', asc: true };
    case 'price_desc':
      return { key: 'usd', asc: false };
  }
}

async function loadBucket(limit: number): Promise<WeeklyBucketResult> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.result;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const bucket = await fetchActiveBucket();
    if (!bucket) {
      const result: WeeklyBucketResult = { bucket: null, cards: [], loading: false };
      cache = { result, fetchedAt: Date.now() };
      return result;
    }

    const { key, asc } = bucketSortToSearchKey(bucket.sort_by);
    let cards: ScryfallCard[] = [];
    try {
      const search = await searchCards(bucket.query, {
        sortKey: key,
        sortAsc: asc,
        unique: 'cards',
      });
      cards = (search?.data ?? []).slice(0, limit);
    } catch (err) {
      // Bucket query failed (network, malformed query, Scryfall 5xx).
      // Hide the section by leaving cards empty — the consumer checks
      // for an empty array.
      console.warn('[useWeeklyBucket] query failed', bucket.query, err);
    }

    const result: WeeklyBucketResult = { bucket, cards, loading: false };
    cache = { result, fetchedAt: Date.now() };
    return result;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/**
 * Returns the active weekly discovery bucket plus its top cards.
 * Designed to fail soft — when there's no active bucket, the request
 * fails, or the query returns zero hits, we just emit `cards: []` and
 * the consumer hides the whole section. Discovery should never block
 * or break the rest of the Search landing.
 */
export function useWeeklyBucket(limit = 12): WeeklyBucketResult {
  const [data, setData] = useState<WeeklyBucketResult>(
    cache?.result ?? { bucket: null, cards: [], loading: true }
  );
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void loadBucket(limit).then((r) => {
      if (mounted.current) setData(r);
    });
    return () => {
      mounted.current = false;
    };
  }, [limit]);

  return data;
}
