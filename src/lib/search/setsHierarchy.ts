import AsyncStorage from '@react-native-async-storage/async-storage';

// Scryfall's `/sets` endpoint returns `parent_set_code` for every
// child set (tokens, promos, commander decks, alchemy variants, etc).
// The catalog snapshot doesn't carry that column today, so we fetch
// + cache the parent map directly from Scryfall — once a week.

const KEY = '@spellkeep/scryfall_sets_hierarchy.v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ENDPOINT = 'https://api.scryfall.com/sets';

type CacheEntry = {
  fetched_at: number;
  /** Map serialized as plain object: code → parent_code (or null). */
  parents: Record<string, string | null>;
};

let memCache: Map<string, string | null> | null = null;
let inFlight: Promise<Map<string, string | null>> | null = null;

async function loadFromStorage(): Promise<Map<string, string | null> | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed?.fetched_at) return null;
    if (Date.now() - parsed.fetched_at > TTL_MS) return null;
    return new Map(Object.entries(parsed.parents ?? {}));
  } catch {
    return null;
  }
}

async function saveToStorage(map: Map<string, string | null>): Promise<void> {
  try {
    const obj: Record<string, string | null> = {};
    for (const [k, v] of map) obj[k] = v;
    const entry: CacheEntry = { fetched_at: Date.now(), parents: obj };
    await AsyncStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // best-effort
  }
}

async function fetchRemote(): Promise<Map<string, string | null>> {
  const res = await fetch(ENDPOINT);
  if (!res.ok) throw new Error(`Scryfall /sets failed: ${res.status}`);
  const json = await res.json();
  const data: { code: string; parent_set_code?: string | null }[] = json?.data ?? [];
  const map = new Map<string, string | null>();
  for (const s of data) {
    if (!s?.code) continue;
    map.set(s.code.toLowerCase(), s.parent_set_code ? s.parent_set_code.toLowerCase() : null);
  }
  return map;
}

export async function getSetsParentMap(): Promise<Map<string, string | null>> {
  if (memCache) return memCache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const stored = await loadFromStorage();
    if (stored) {
      memCache = stored;
      return stored;
    }
    try {
      const fresh = await fetchRemote();
      memCache = fresh;
      void saveToStorage(fresh);
      return fresh;
    } catch {
      memCache = new Map();
      return memCache;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function getCachedSetsParentMap(): Map<string, string | null> | null {
  return memCache;
}
