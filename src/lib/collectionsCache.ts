// Lightweight in-memory cache for collection data so re-opening a
// binder feels instant. SWR: callers paint cached values immediately,
// then run a background fetch that replaces the cache when complete.
// Any mutation from anywhere in the app shows up on that background
// refresh; we don't chase invalidation events for scan / edit /
// import individually.
//
// Bounded to a small LRU per namespace so a user bouncing through
// many binders doesn't balloon RAM. Generic over the cached value
// type so we can keep entries and stats in separate namespaces
// without extra wrapping.

const MAX_ENTRIES = 5;

type CacheEntry<T> = {
  value: T;
  at: number;
};

const caches = new Map<string, Map<string, CacheEntry<any>>>();

function getBucket(namespace: string): Map<string, CacheEntry<any>> {
  let bucket = caches.get(namespace);
  if (!bucket) {
    bucket = new Map();
    caches.set(namespace, bucket);
  }
  return bucket;
}

function touch<T>(bucket: Map<string, CacheEntry<T>>, key: string, entry: CacheEntry<T>) {
  // Re-insert so the Map iteration order tracks LRU: oldest entry is
  // the first key and gets evicted when the bucket overflows.
  bucket.delete(key);
  bucket.set(key, entry);
  while (bucket.size > MAX_ENTRIES) {
    const firstKey = bucket.keys().next().value;
    if (firstKey === undefined) break;
    bucket.delete(firstKey);
  }
}

export function getCached<T>(namespace: string, key: string): T | null {
  const bucket = getBucket(namespace);
  const entry = bucket.get(key);
  if (!entry) return null;
  touch(bucket, key, entry);
  return entry.value as T;
}

export function setCached<T>(namespace: string, key: string, value: T): void {
  const bucket = getBucket(namespace);
  touch(bucket, key, { value, at: Date.now() });
}

// Back-compat aliases for the array-only flavour used in earlier
// commits. Now just thin wrappers around the generic API.
export function getCachedEntries<T = any>(namespace: string, key: string): T[] | null {
  return getCached<T[]>(namespace, key);
}
export function setCachedEntries<T = any>(namespace: string, key: string, rows: T[]): void {
  setCached<T[]>(namespace, key, rows);
}

/**
 * Explicit invalidation when we know the data changed (delete, empty,
 * merge, duplicate). Not required for correctness thanks to SWR — the
 * background refetch eventually syncs — but useful when the old cache
 * is so far from truth that showing it would be confusing.
 */
export function invalidateCache(namespace: string, key: string): void {
  getBucket(namespace).delete(key);
}

export function invalidateNamespace(namespace: string): void {
  caches.delete(namespace);
}
