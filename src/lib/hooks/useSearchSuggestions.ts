import { useEffect, useRef, useState } from 'react';
import { autocomplete, type ScryfallCard } from '../scryfall';
import { batchResolveByName, isCatalogReady } from '../catalog/catalogQueries';
import { useDebounce } from '../../hooks/useDebounce';

const MIN_LENGTH = 2;
const MAX_SUGGESTIONS = 5;
// Pull more names than we display so we can filter Art Series (and
// other non-card products) and still hit MAX_SUGGESTIONS in most cases.
const NAME_FETCH_LIMIT = 15;

// Suggestion list should only contain real cards. Art Series share
// names with their parent cards, so a hit on `Lightning Bolt` from a
// Secret Lair Art Series isn't useful — the user wants the actual
// playable card. Filter at the layout level.
const HIDDEN_LAYOUTS = new Set(['art_series']);

/**
 * Debounced autocomplete + local-catalog enrichment. Returns up to 8
 * cards (newest printing per name) ready to render with thumbnail +
 * set + price. Skips when the input looks like a Scryfall-syntax
 * query — those go through the full search path, not autocomplete.
 *
 * Online vs offline: `autocomplete()` already prefers the local
 * catalog when ready; the resolution into ScryfallCard always goes
 * through `batchResolveByName` (local). If we're offline AND the
 * local catalog has not been hydrated yet, suggestions stay empty.
 */
export function useSearchSuggestions(query: string) {
  const debounced = useDebounce(query, 200);
  const [suggestions, setSuggestions] = useState<ScryfallCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const trimmed = debounced.trim();

    // Don't autocomplete on syntax-flavored queries (`set:`, `c:`, etc.) —
    // those are full searches, surfacing names would be misleading.
    const looksLikeSyntax = /[:!"<>=]/.test(trimmed);

    if (trimmed.length < MIN_LENGTH || looksLikeSyntax) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    const reqId = ++reqIdRef.current;
    setIsLoading(true);

    (async () => {
      try {
        const names = await autocomplete(trimmed);
        const candidateNames = names.slice(0, NAME_FETCH_LIMIT);
        if (candidateNames.length === 0) {
          if (reqIdRef.current === reqId) {
            setSuggestions([]);
            setIsLoading(false);
          }
          return;
        }

        const ready = await isCatalogReady();
        let resolved: ScryfallCard[] = [];
        if (ready) {
          const map = await batchResolveByName(candidateNames);
          resolved = candidateNames
            .map((n) => map.get(n))
            .filter((c): c is ScryfallCard => !!c)
            .filter((c) => !HIDDEN_LAYOUTS.has(c.layout))
            .slice(0, MAX_SUGGESTIONS);
        }

        if (reqIdRef.current !== reqId) return;
        setSuggestions(resolved);
        setIsLoading(false);
      } catch {
        if (reqIdRef.current === reqId) {
          setSuggestions([]);
          setIsLoading(false);
        }
      }
    })();
  }, [debounced]);

  return { suggestions, isLoading };
}
