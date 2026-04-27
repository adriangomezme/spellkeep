import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ToolbarSize, ViewMode } from '../../components/collection/CollectionToolbar';
import type { SortOption } from '../../components/collection/SortSheet';

// Per-device preference for how collection screens (binder / list /
// owned detail) are rendered. AsyncStorage is deliberate: the user
// wants each device to remember its own layout, not sync across
// devices. Filters are explicitly NOT persisted.

const KEY = '@spellkeep/collection_view_prefs.v1';

export const CARDS_PER_ROW_OPTIONS = [1, 2, 3, 4] as const;
export type CardsPerRow = (typeof CARDS_PER_ROW_OPTIONS)[number];

export const TOOLBAR_SIZE_OPTIONS = ['small', 'medium', 'large'] as const;

function coerceCardsPerRow(v: unknown): CardsPerRow {
  return (CARDS_PER_ROW_OPTIONS as readonly number[]).includes(v as number)
    ? (v as CardsPerRow)
    : 2;
}

function coerceToolbarSize(v: unknown): ToolbarSize {
  return (TOOLBAR_SIZE_OPTIONS as readonly string[]).includes(v as string)
    ? (v as ToolbarSize)
    : 'small';
}

type Prefs = {
  viewMode: ViewMode;
  sortBy: SortOption;
  sortAsc: boolean;
  cardsPerRow: CardsPerRow;
  toolbarSize: ToolbarSize;
};

const DEFAULTS: Prefs = {
  viewMode: 'grid-compact',
  sortBy: 'added',
  sortAsc: false,
  cardsPerRow: 2,
  toolbarSize: 'small',
};

// Module-level cache + pub/sub so a write from one screen (e.g.
// /profile/grid) propagates to every other mounted hook instance
// (Search tab, Owned, binder detail, ...) in the same render tick.
// Without this, the per-screen useState only updated on app restart.
let cache: Prefs | null = null;
let inFlightLoad: Promise<Prefs> | null = null;
const subscribers = new Set<(p: Prefs) => void>();

function notify() {
  if (cache == null) return;
  for (const cb of subscribers) cb(cache);
}

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
        cardsPerRow: coerceCardsPerRow(parsed.cardsPerRow),
        toolbarSize: coerceToolbarSize(parsed.toolbarSize),
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
  notify();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn('[useCollectionViewPrefs] save failed', err);
  }
}

export function useCollectionViewPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(cache ?? DEFAULTS);
  const [isHydrated, setIsHydrated] = useState(cache != null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const cb = (next: Prefs) => {
      if (mounted.current) setPrefs(next);
    };
    subscribers.add(cb);
    loadPrefs().then((loaded) => {
      if (!mounted.current) return;
      setPrefs(loaded);
      setIsHydrated(true);
    });
    return () => {
      mounted.current = false;
      subscribers.delete(cb);
    };
  }, []);

  const setViewMode = useCallback((v: ViewMode) => {
    void savePrefs({ ...(cache ?? DEFAULTS), viewMode: v });
  }, []);

  const setSortBy = useCallback((s: SortOption) => {
    void savePrefs({ ...(cache ?? DEFAULTS), sortBy: s });
  }, []);

  const setSortAsc = useCallback((asc: boolean) => {
    void savePrefs({ ...(cache ?? DEFAULTS), sortAsc: asc });
  }, []);

  const setCardsPerRow = useCallback((n: CardsPerRow) => {
    void savePrefs({ ...(cache ?? DEFAULTS), cardsPerRow: n });
  }, []);

  const setToolbarSize = useCallback((s: ToolbarSize) => {
    void savePrefs({ ...(cache ?? DEFAULTS), toolbarSize: s });
  }, []);

  return {
    viewMode: prefs.viewMode,
    sortBy: prefs.sortBy,
    sortAsc: prefs.sortAsc,
    cardsPerRow: prefs.cardsPerRow,
    toolbarSize: prefs.toolbarSize,
    isHydrated,
    setViewMode,
    setSortBy,
    setSortAsc,
    setCardsPerRow,
    setToolbarSize,
  };
}
