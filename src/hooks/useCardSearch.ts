import { useState, useEffect, useCallback } from 'react';
import { searchCards, ScryfallCard, ScryfallSearchResult } from '../lib/scryfall';
import { useDebounce } from './useDebounce';

type SearchState = {
  results: ScryfallCard[];
  totalCards: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  page: number;
};

export function useCardSearch() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const [state, setState] = useState<SearchState>({
    results: [],
    totalCards: 0,
    hasMore: false,
    isLoading: false,
    error: null,
    page: 1,
  });

  // Search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setState({
        results: [],
        totalCards: 0,
        hasMore: false,
        isLoading: false,
        error: null,
        page: 1,
      });
      return;
    }

    performSearch(debouncedQuery, 1);
  }, [debouncedQuery]);

  async function performSearch(q: string, page: number) {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const data = await searchCards(q, page);

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

  const loadMore = useCallback(() => {
    if (state.hasMore && !state.isLoading && debouncedQuery.length >= 2) {
      performSearch(debouncedQuery, state.page + 1);
    }
  }, [state.hasMore, state.isLoading, state.page, debouncedQuery]);

  const clear = useCallback(() => {
    setQuery('');
    setState({
      results: [],
      totalCards: 0,
      hasMore: false,
      isLoading: false,
      error: null,
      page: 1,
    });
  }, []);

  return {
    query,
    setQuery,
    results: state.results,
    totalCards: state.totalCards,
    hasMore: state.hasMore,
    isLoading: state.isLoading,
    error: state.error,
    loadMore,
    clear,
  };
}
