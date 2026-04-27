import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EMPTY_SEARCH_FILTERS,
  type SearchFilterState,
} from '../search/searchFilters';

// Session-scoped (no AsyncStorage). The filter screen is a separate
// route so we need a shared store across the mount boundary. A
// module-level cache + pub/sub keeps the search tab and the filter
// screen in sync without round-tripping through expo-router params.

let cache: SearchFilterState = EMPTY_SEARCH_FILTERS;
const subscribers = new Set<(s: SearchFilterState) => void>();

function notify() {
  for (const cb of subscribers) cb(cache);
}

export function getSearchFilters(): SearchFilterState {
  return cache;
}

export function setSearchFilters(next: SearchFilterState): void {
  cache = next;
  notify();
}

export function resetSearchFilters(): void {
  cache = EMPTY_SEARCH_FILTERS;
  notify();
}

export function useSearchFilters() {
  const [filters, setFiltersState] = useState<SearchFilterState>(cache);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const cb = (next: SearchFilterState) => {
      if (mounted.current) setFiltersState(next);
    };
    subscribers.add(cb);
    return () => {
      mounted.current = false;
      subscribers.delete(cb);
    };
  }, []);

  const set = useCallback((next: SearchFilterState) => {
    setSearchFilters(next);
  }, []);

  const reset = useCallback(() => {
    resetSearchFilters();
  }, []);

  return { filters, setFilters: set, resetFilters: reset };
}
