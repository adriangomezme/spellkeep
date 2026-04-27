import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ViewMode } from '../../components/collection/CollectionToolbar';
import type { SortOption } from '../../components/collection/SortSheet';

// Per-device preference for the Search tab's results layout. Kept
// separate from the collection prefs (binder/list/owned) because the
// Search universe is heterogeneous — users tend to want a denser layout
// here than for their own neatly-organized binders.

const KEY = '@spellkeep/search_view_prefs.v1';

type Prefs = {
  viewMode: ViewMode;
  sortBy: SortOption;
  sortAsc: boolean;
};

const DEFAULTS: Prefs = {
  viewMode: 'grid',
  sortBy: 'name',
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
    console.warn('[searchViewPrefs] save failed', err);
  }
}

export function useSearchViewPrefs() {
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
