import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ViewMode } from '../../components/collection/CollectionToolbar';
import type { SortOption } from '../../components/collection/SortSheet';

// Per-device preference for the Set Detail screen's results layout.
// Kept separate from useSearchViewPrefs (search hub / cards results)
// and from useCollectionViewPrefs (owned / binder / list) because each
// surface has its own ergonomic default — a set is naturally browsed
// in collector-number order, the search hub leans on EDHREC popularity,
// and a binder uses whatever the user organized it as.
//
// The shape mirrors the other two view-prefs hooks (viewMode + sortBy
// + sortAsc) so set/[code].tsx can drop-in swap.

const KEY = '@spellkeep/set_view_prefs.v1';

type Prefs = {
  viewMode: ViewMode;
  sortBy: SortOption;
  sortAsc: boolean;
};

const DEFAULTS: Prefs = {
  viewMode: 'grid',
  sortBy: 'collector_number',
  sortAsc: true,
};

let cache: Prefs | null = null;
let inFlightLoad: Promise<Prefs> | null = null;

async function loadPrefs(): Promise<Prefs> {
  if (cache) return cache;
  if (inFlightLoad) return inFlightLoad;
  inFlightLoad = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) {
        cache = DEFAULTS;
        return DEFAULTS;
      }
      const parsed = JSON.parse(raw) as Partial<Prefs>;
      cache = {
        viewMode: parsed.viewMode ?? DEFAULTS.viewMode,
        sortBy: parsed.sortBy ?? DEFAULTS.sortBy,
        sortAsc: typeof parsed.sortAsc === 'boolean' ? parsed.sortAsc : DEFAULTS.sortAsc,
      };
      return cache;
    } catch {
      cache = DEFAULTS;
      return DEFAULTS;
    } finally {
      inFlightLoad = null;
    }
  })();
  return inFlightLoad;
}

async function savePrefs(prefs: Prefs): Promise<void> {
  cache = prefs;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn('[setViewPrefs] save failed', err);
  }
}

export function useSetViewPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(cache ?? DEFAULTS);
  const [isHydrated, setIsHydrated] = useState(cache != null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    loadPrefs().then((loaded) => {
      if (!mounted.current) return;
      setPrefs(loaded);
      setIsHydrated(true);
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  const setViewMode = useCallback((v: ViewMode) => {
    setPrefs((p) => {
      const next = { ...p, viewMode: v };
      void savePrefs(next);
      return next;
    });
  }, []);

  const setSortBy = useCallback((s: SortOption) => {
    setPrefs((p) => {
      const next = { ...p, sortBy: s };
      void savePrefs(next);
      return next;
    });
  }, []);

  const setSortAsc = useCallback((asc: boolean) => {
    setPrefs((p) => {
      const next = { ...p, sortAsc: asc };
      void savePrefs(next);
      return next;
    });
  }, []);

  return {
    viewMode: prefs.viewMode,
    sortBy: prefs.sortBy,
    sortAsc: prefs.sortAsc,
    isHydrated,
    setViewMode,
    setSortBy,
    setSortAsc,
  };
}
