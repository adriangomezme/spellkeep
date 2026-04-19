// Lightweight in-memory cache for collection entries so re-opening a
// binder feels instant. This is a true SWR cache: callers paint cached
// data immediately, then run a background fetch that replaces the cache
// once the full refresh completes. Any mutation from anywhere in the
// app gets picked up by that background fetch on next open — we don't
// chase invalidation events for scan / edit / import individually.
//
// Bounded to a small LRU so a user bouncing through many binders doesn't
// balloon RAM. Entries are dropped when evicted; the next open falls
// back to the streamed fetch, which is already fast thanks to the 100-
// row first page.

const MAX_ENTRIES = 5;

type CacheEntry<T> = {
  rows: T[];
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
  // Re-insert to move to the tail of Map iteration order — Map keeps
  // insertion order, so the oldest entry is the first key.
  bucket.delete(key);
  bucket.set(key, entry);
  while (bucket.size > MAX_ENTRIES) {
    const firstKey = bucket.keys().next().value;
    if (firstKey === undefined) break;
    bucket.delete(firstKey);
  }
}

export function getCachedEntries<T = any>(namespace: string, key: string): T[] | null {
  const bucket = getBucket(namespace);
  const entry = bucket.get(key);
  if (!entry) return null;
  touch(bucket, key, entry);
  return entry.rows as T[];
}

export function setCachedEntries<T = any>(namespace: string, key: string, rows: T[]): void {
  const bucket = getBucket(namespace);
  touch(bucket, key, { rows, at: Date.now() });
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
