import { useEffect, useRef, useState } from 'react';
import {
  getScryfallCatalog,
  getCachedScryfallCatalog,
  type ScryfallCatalogKey,
} from '../search/scryfallCatalogs';

/**
 * Returns a Scryfall catalog (keywords, types, artists, etc) ready
 * for the filter UI. Renders an empty list while the first fetch is
 * in flight; subsequent renders are synchronous from the in-memory
 * cache. A `fallback` may be supplied to keep the UI populated for
 * the first paint.
 */
export function useScryfallCatalog(key: ScryfallCatalogKey, fallback: string[] = []): string[] {
  const cached = getCachedScryfallCatalog(key);
  const [data, setData] = useState<string[]>(cached ?? fallback);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (cached) return; // already populated
    void getScryfallCatalog(key).then((resolved) => {
      if (mounted.current && resolved.length > 0) setData(resolved);
    });
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return data;
}
