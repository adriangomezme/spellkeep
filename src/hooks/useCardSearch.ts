import { useState, useEffect, useCallback } from 'react';
import {
  searchCards,
  type ScryfallCard,
  type SearchSortKey,
} from '../lib/scryfall';
import type { SortOption } from '../components/collection/SortSheet';

type SearchState = {
  results: ScryfallCard[];
  totalCards: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  page: number;
};

type Options = {
  sortBy?: SortOption;
  sortAsc?: boolean;
  /** Scryfall syntax fragment appended to the user's text query. Set
   *  by the Filter screen via `useSearchFilters` →
   *  `buildSearchQueryFragment`. Empty string = no filters active. */
  extraQuery?: string;
  /** When true, the user's submitted text is wrapped in `!"..."` so
   *  Scryfall enforces an exact name match. */
  exactName?: boolean;
  /** Scryfall unique mode. Search defaults to 'art'; the filter
   *  screen's "Unique" toggle flips to 'cards' (oracle-level dedup). */
  uniqueMode?: 'art' | 'cards' | 'prints';
};

const SORT_TO_SCRYFALL: Partial<Record<SortOption, SearchSortKey>> = {
  name: 'name',
  mana_value: 'cmc',
  price: 'usd',
  color_identity: 'color',
  rarity: 'rarity',
  collector_number: 'set',
  set_code: 'set',
  set_name: 'set',
  added: 'released',
  edhrec_rank: 'edhrec',
};

const INITIAL: SearchState = {
  results: [],
  totalCards: 0,
  hasMore: false,
  isLoading: false,
  error: null,
  page: 1,
};

/**
 * Search execution model:
 *  - `query` is the live input (used to drive autocomplete suggestions
 *    elsewhere). Editing it does NOT fire a search.
 *  - `submittedQuery` is the value that actually drives the API call;
 *    set explicitly via `submit()`. This avoids burning Scryfall calls
 *    (and battery / data) on every keystroke.
 *  - `extraQuery` (filter fragment) participates in the trigger:
 *    changing filters fires a re-search even without a fresh submit.
 *    A non-empty filter alone is enough to run the search even when
 *    the text input is empty (e.g. "show me red rare creatures" with
 *    no name).
 *  - `clear()` resets text and filter-driven results state in one go.
 */
export function useCardSearch(opts: Options = {}) {
  const {
    sortBy = 'name',
    sortAsc = true,
    extraQuery = '',
    exactName = false,
    uniqueMode = 'art',
  } = opts;
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [state, setState] = useState<SearchState>(INITIAL);

  useEffect(() => {
    const text = submittedQuery.trim();
    const fragment = extraQuery.trim();
    // Need at least 2 chars OR a non-empty filter to fire a search.
    // Pure-text-only with <2 chars still bails (Scryfall rejects).
    const hasText = text.length >= 2;
    const hasFilters = fragment.length > 0;
    if (!hasText && !hasFilters) {
      setState(INITIAL);
      return;
    }
    performSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedQuery, extraQuery, sortBy, sortAsc, exactName, uniqueMode]);

  function buildFullQuery(): string {
    const text = submittedQuery.trim();
    const fragment = extraQuery.trim();
    const wrappedText = exactName && text ? `!"${text.replace(/"/g, '')}"` : text;
    return [wrappedText, fragment].filter(Boolean).join(' ');
  }

  async function performSearch(page: number) {
    const fullQuery = buildFullQuery();
    if (fullQuery.length < 2) {
      setState(INITIAL);
      return;
    }
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const data = await searchCards(fullQuery, {
        page,
        sortKey: SORT_TO_SCRYFALL[sortBy],
        sortAsc,
        unique: uniqueMode,
      });

      if (!data) {
        setState((prev) => ({
          ...prev,
          results: page === 1 ? [] : prev.results,
          totalCards: 0,
          hasMore: false,
          isLoading: false,
        }));
        return;
      }

      setState((prev) => ({
        results: page === 1 ? data.data : [...prev.results, ...data.data],
        totalCards: data.total_cards,
        hasMore: data.has_more,
        isLoading: false,
        error: null,
        page,
      }));
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err.message || 'Search failed',
      }));
    }
  }

  const submit = useCallback(
    (override?: string) => {
      const target = (override ?? query).trim();
      // Allow submit with empty text when filters are active — they
      // alone are enough to drive a result set.
      if (target.length < 2 && extraQuery.trim().length === 0) return;
      setQuery(target);
      setSubmittedQuery(target);
    },
    [query, extraQuery]
  );

  const loadMore = useCallback(() => {
    const hasInput = submittedQuery.trim().length >= 2 || extraQuery.trim().length > 0;
    if (state.hasMore && !state.isLoading && hasInput) {
      performSearch(state.page + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hasMore, state.isLoading, state.page, submittedQuery, extraQuery, sortBy, sortAsc, exactName, uniqueMode]);

  const clear = useCallback(() => {
    setQuery('');
    setSubmittedQuery('');
    setState(INITIAL);
  }, []);

  return {
    query,
    setQuery,
    submittedQuery,
    submit,
    results: state.results,
    totalCards: state.totalCards,
    hasMore: state.hasMore,
    isLoading: state.isLoading,
    error: state.error,
    loadMore,
    clear,
  };
}
