import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SearchFilterState } from '../search/searchFilters';

const KEY = '@spellkeep/search_filter_presets.v1';
const MAX_PRESETS = 30;

export type FilterPreset = {
  id: string;
  name: string;
  filters: SearchFilterState;
  saved_at: number;
};

let cache: FilterPreset[] | null = null;
let inFlightLoad: Promise<FilterPreset[]> | null = null;
const subscribers = new Set<(items: FilterPreset[]) => void>();

function notify() {
  if (cache == null) return;
  for (const cb of subscribers) cb(cache);
}

async function loadFromStorage(): Promise<FilterPreset[]> {
  if (cache) return cache;
  if (inFlightLoad) return inFlightLoad;
  inFlightLoad = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as FilterPreset[]) : [];
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

async function persist(items: FilterPreset[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('[filterPresets] save failed', err);
  }
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveFilterPreset(
  name: string,
  filters: SearchFilterState
): Promise<FilterPreset | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const current = await loadFromStorage();
  // Reusing an existing name overwrites the entry instead of cluttering
  // the list with near-duplicates.
  const filtered = current.filter((p) => p.name.toLowerCase() !== trimmed.toLowerCase());
  const next: FilterPreset = {
    id: makeId(),
    name: trimmed,
    filters,
    saved_at: Date.now(),
  };
  const merged = [next, ...filtered].slice(0, MAX_PRESETS);
  cache = merged;
  notify();
  await persist(merged);
  return next;
}

export async function deleteFilterPreset(id: string): Promise<void> {
  const current = await loadFromStorage();
  const next = current.filter((p) => p.id !== id);
  cache = next;
  notify();
  await persist(next);
}

export async function clearFilterPresets(): Promise<void> {
  cache = [];
  notify();
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

/**
 * Saved filter presets. Persisted in AsyncStorage; new entries bubble
 * to the top, capped at 30 to keep the picker manageable.
 */
export function useFilterPresets() {
  const [items, setItems] = useState<FilterPreset[]>(cache ?? []);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const cb = (next: FilterPreset[]) => {
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

  const save = useCallback(
    (name: string, filters: SearchFilterState) => saveFilterPreset(name, filters),
    []
  );
  const remove = useCallback((id: string) => {
    void deleteFilterPreset(id);
  }, []);
  const clear = useCallback(() => {
    void clearFilterPresets();
  }, []);

  return { items, save, remove, clear };
}
