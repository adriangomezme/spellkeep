import AsyncStorage from '@react-native-async-storage/async-storage';

// Scryfall publishes static "catalogs" (lists of legal values) the
// app reuses to populate filter dropdowns: every keyword ability
// known to the rules, every artist who's drawn a card, every type
// the rules engine recognizes, etc.
//
// We hit each endpoint at most once per week per device — these lists
// only grow when new sets release — and persist the result in
// AsyncStorage so the filter screen renders instantly the second time
// it opens.

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const KEY_PREFIX = '@spellkeep/scryfall_catalog/';

const ENDPOINTS = {
  keywordAbilities: 'https://api.scryfall.com/catalog/keyword-abilities',
  keywordActions: 'https://api.scryfall.com/catalog/keyword-actions',
  abilityWords: 'https://api.scryfall.com/catalog/ability-words',
  cardTypes: 'https://api.scryfall.com/catalog/card-types',
  supertypes: 'https://api.scryfall.com/catalog/supertypes',
  creatureTypes: 'https://api.scryfall.com/catalog/creature-types',
  planeswalkerTypes: 'https://api.scryfall.com/catalog/planeswalker-types',
  landTypes: 'https://api.scryfall.com/catalog/land-types',
  artists: 'https://api.scryfall.com/catalog/artist-names',
} as const;

export type ScryfallCatalogKey = keyof typeof ENDPOINTS;

type CacheEntry = {
  fetched_at: number;
  data: string[];
};

// In-memory cache so reads after the first AsyncStorage hydrate are
// synchronous + zero-allocation.
const memCache = new Map<ScryfallCatalogKey, string[]>();
const inFlight = new Map<ScryfallCatalogKey, Promise<string[]>>();

async function loadFromStorage(key: ScryfallCatalogKey): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed?.fetched_at || !Array.isArray(parsed.data)) return null;
    if (Date.now() - parsed.fetched_at > TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

async function saveToStorage(key: ScryfallCatalogKey, data: string[]): Promise<void> {
  try {
    const entry: CacheEntry = { fetched_at: Date.now(), data };
    await AsyncStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry));
  } catch {
    /* ignore — cache is best-effort */
  }
}

async function fetchRemote(key: ScryfallCatalogKey): Promise<string[]> {
  const res = await fetch(ENDPOINTS[key]);
  if (!res.ok) throw new Error(`Scryfall catalog ${key} failed: ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json?.data)) throw new Error(`Bad shape for catalog ${key}`);
  return json.data as string[];
}

/**
 * Resolve a catalog, preferring in-memory → AsyncStorage → network
 * (in that order). Repeat callers within a session pay only the
 * first-call cost.
 */
export async function getScryfallCatalog(key: ScryfallCatalogKey): Promise<string[]> {
  const mem = memCache.get(key);
  if (mem) return mem;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const stored = await loadFromStorage(key);
    if (stored) {
      memCache.set(key, stored);
      return stored;
    }
    try {
      const fresh = await fetchRemote(key);
      memCache.set(key, fresh);
      void saveToStorage(key, fresh);
      return fresh;
    } catch {
      // Offline / API down — return empty so the UI degrades to its
      // hardcoded fallback list (declared next to each consumer).
      return [];
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

/**
 * Hook-style helper that returns a synchronous array (initially the
 * hardcoded fallback if available, then swapped to the resolved
 * catalog on next render). For React-driven UIs use the hook in
 * `src/lib/hooks/useScryfallCatalog.ts`.
 */
export function getCachedScryfallCatalog(key: ScryfallCatalogKey): string[] | null {
  return memCache.get(key) ?? null;
}
