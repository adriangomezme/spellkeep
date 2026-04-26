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

let inFlightLoad: Promise<Prefs> | null = null;

async function loadPrefs(): Promise<Prefs> {
  if (inFlightLoad) return inFlightLoad;
  inFlightLoad = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return DEFAULTS;
      const parsed = JSON.parse(raw) as Partial<Prefs>;
      return {
        viewMode: parsed.viewMode ?? DEFAULTS.viewMode,
        sortBy: parsed.sortBy ?? DEFAULTS.sortBy,
        sortAsc: typeof parsed.sortAsc === 'boolean' ? parsed.sortAsc : DEFAULTS.sortAsc,
        cardsPerRow: coerceCardsPerRow(parsed.cardsPerRow),
        toolbarSize: coerceToolbarSize(parsed.toolbarSize),
      };
    } catch {
      return DEFAULTS;
    } finally {
      inFlightLoad = null;
    }
  })();
  return inFlightLoad;
}

async function savePrefs(prefs: Prefs): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn('[useCollectionViewPrefs] save failed', err);
  }
}

/**
 * View + sort preferences shared across binder / list / owned detail.
 * Hydrates from AsyncStorage on first use; subsequent setters persist
 * the change back. `isHydrated` lets callers gate "first paint uses
 * saved layout" if they want, but most screens can just use the values
 * — the initial flash (default → saved) happens in a single frame for
 * a warm cache.
 */
export function useCollectionViewPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [isHydrated, setIsHydrated] = useState(false);
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
      savePrefs(next);
      return next;
    });
  }, []);

  const setSortBy = useCallback((s: SortOption) => {
    setPrefs((p) => {
      const next = { ...p, sortBy: s };
      savePrefs(next);
      return next;
    });
  }, []);

  const setSortAsc = useCallback((asc: boolean) => {
    setPrefs((p) => {
      const next = { ...p, sortAsc: asc };
      savePrefs(next);
      return next;
    });
  }, []);

  const setCardsPerRow = useCallback((n: CardsPerRow) => {
    setPrefs((p) => {
      const next = { ...p, cardsPerRow: n };
      savePrefs(next);
      return next;
    });
  }, []);

  const setToolbarSize = useCallback((s: ToolbarSize) => {
    setPrefs((p) => {
      const next = { ...p, toolbarSize: s };
      savePrefs(next);
      return next;
    });
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
