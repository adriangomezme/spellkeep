import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SearchFilterState } from '../search/searchFilters';

const KEY = '@spellkeep/recent_searches.v1';
const MAX_ITEMS = 10;
const MIN_LENGTH = 2;

export type RecentSearch = {
  /** Display label shown in the dropdown / landing card. For text
   *  searches this is the typed query; for structured intents (artist
   *  pill, "browse this set", …) it's a friendly summary like
   *  "Artist: Greg Staples". */
  query: string;
  searched_at: number;
  /** Up to 4 small image URLs of result cards, persisted alongside the
   *  query so the landing screen can show Pinterest-style previews
   *  without re-running the search. Populated lazily once the search
   *  results land. */
  previews?: string[];
  /** Total count of results returned for the query at the time it was
   *  last executed. Stored only to display "1,234 results" in the
   *  landing card; not used for cache invalidation. */
  total?: number;
  /** Free-text portion of the search (without the structured filters).
   *  Stored separately from `query` so re-tapping a structured recent
   *  re-applies the filters AND restores the typed text correctly. */
  text?: string;
  /** Snapshot of the filter state when the recent was created. Lets
   *  re-tap restore the full search context — colors, types, artist,
   *  oracleTexts, etc. — instead of just the text. */
  filters?: Partial<SearchFilterState>;
};

let cache: RecentSearch[] | null = null;
let inFlightLoad: Promise<RecentSearch[]> | null = null;
const subscribers = new Set<(items: RecentSearch[]) => void>();

function notify() {
  if (cache == null) return;
  for (const cb of subscribers) cb(cache);
}

async function loadFromStorage(): Promise<RecentSearch[]> {
  if (cache) return cache;
  if (inFlightLoad) return inFlightLoad;
  inFlightLoad = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as RecentSearch[]) : [];
      cache = Array.isArray(parsed) ? parsed : [];
      return cache;
    } catch {
      cache = [];
      return cache;
    } finally {
      inFlightLoad = null;
    }
  })();
  return inFlightLoad;
}

async function persist(items: RecentSearch[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('[recentSearches] save failed', err);
  }
}

export async function addRecentSearch(
  query: string,
  options?: { text?: string; filters?: Partial<SearchFilterState> }
): Promise<void> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_LENGTH) return;
  const current = await loadFromStorage();
  const lc = trimmed.toLowerCase();
  // Re-running an existing recent preserves any previews / total it
  // already has — the meta will be refreshed by `updateRecentSearchMeta`
  // once results land.
  const existing = current.find((c) => c.query.toLowerCase() === lc);
  const filtered = current.filter((c) => c.query.toLowerCase() !== lc);
  const next = [
    {
      query: trimmed,
      searched_at: Date.now(),
      previews: existing?.previews,
      total: existing?.total,
      text: options?.text,
      filters: options?.filters,
    },
    ...filtered,
  ].slice(0, MAX_ITEMS);
  cache = next;
  notify();
  await persist(next);
}

/**
 * Attach (or refresh) preview thumbnails + total count for an existing
 * recent. No-op when the entry was already evicted. Does NOT bump the
 * `searched_at` order so the list remains stable while results stream
 * in.
 */
export async function updateRecentSearchMeta(
  query: string,
  previews: string[],
  total: number
): Promise<void> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_LENGTH) return;
  const current = await loadFromStorage();
  const lc = trimmed.toLowerCase();
  const idx = current.findIndex((c) => c.query.toLowerCase() === lc);
  if (idx < 0) return;
  const existing = current[idx];
  if (
    existing.total === total &&
    existing.previews?.length === previews.length &&
    existing.previews.every((p, i) => p === previews[i])
  ) {
    return; // nothing to write
  }
  const next = [...current];
  next[idx] = { ...existing, previews, total };
  cache = next;
  notify();
  await persist(next);
}

export async function removeRecentSearch(query: string): Promise<void> {
  const current = await loadFromStorage();
  const next = current.filter((c) => c.query !== query);
  cache = next;
  notify();
  await persist(next);
}

export async function clearRecentSearches(): Promise<void> {
  cache = [];
  notify();
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

export function useRecentSearches() {
  const [items, setItems] = useState<RecentSearch[]>(cache ?? []);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const cb = (next: RecentSearch[]) => {
      if (mounted.current) setItems(next);
    };
    subscribers.add(cb);
    loadFromStorage().then((loaded) => {
      if (mounted.current) setItems(loaded);
    });
    return () => {
      mounted.current = false;
      subscribers.delete(cb);
    };
  }, []);

  const remove = useCallback((query: string) => {
    void removeRecentSearch(query);
  }, []);

  const clear = useCallback(() => {
    void clearRecentSearches();
  }, []);

  return { items, remove, clear };
}
