import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { invalidateCache, invalidateNamespace } from './collectionsCache';
import { db } from './powersync';
import { overlay } from './uiStore';
import { duplicateCollectionLocal, mergeCollectionsLocal } from './collections.local';

// How long to wait for PowerSync to stream freshly-created rows to local
// SQLite after a server-side bulk RPC. The overlay stays up during this
// window so the user sees progress instead of a "done but empty" binder.
// Keep ample for 100k-row collections — if we hit the cap we just release
// the overlay and the sync finishes in the background.
const SYNC_WAIT_MAX_MS = 60_000;
const SYNC_WAIT_POLL_MS = 150;

// Total cards = sum of (normal + foil + etched) quantities, not the row
// count. One row with qty_normal=4 is "4 cards" to the user, not 1 —
// COUNT(*) would give the unique-variants number, which isn't what the
// overlay is trying to convey.
async function localCountForCollection(collectionId: string): Promise<number> {
  try {
    const rows = await db.getAll<{ c: number }>(
      `SELECT COALESCE(SUM(quantity_normal + quantity_foil + quantity_etched), 0) AS c
         FROM collection_cards WHERE collection_id = ?`,
      [collectionId]
    );
    return Number(rows?.[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Wait for PowerSync to stream at least `expected` rows into the given
 * collection's local SQLite. Returns silently if the cap elapses — the
 * rows will still land eventually via normal sync.
 *
 * PowerSync commits checkpoints atomically, so the local count jumps
 * from 0 to N in one step — we can't show a gradual "X of Y" bar. Just
 * let the overlay's indeterminate spinner do its job.
 */
async function waitForLocalSync(collectionId: string, expected: number): Promise<void> {
  if (expected <= 0) return;
  const start = Date.now();
  while (Date.now() - start < SYNC_WAIT_MAX_MS) {
    const local = await localCountForCollection(collectionId);
    if (local >= expected) return;
    await new Promise((r) => setTimeout(r, SYNC_WAIT_POLL_MS));
  }
}

const LAST_DESTINATION_KEY = 'spellkeep_last_destination';

// ============================================================
// Types
// ============================================================

export type CollectionType = 'binder' | 'list';

export type CollectionSummary = {
  id: string;
  name: string;
  type: CollectionType;
  folder_id: string | null;
  color: string | null;
  card_count: number;
  unique_cards: number;
  total_value: number;
  /**
   * True when we have either a live aggregate or a cached snapshot for
   * this collection's counts. False when BOTH are still loading — the
   * caller should avoid painting "0 Cards · 0 unique" in that window to
   * prevent the blink-from-zero on folder open.
   */
  statsReady?: boolean;
};

export type FolderSummary = {
  id: string;
  name: string;
  type: CollectionType;
  color: string | null;
  item_count: number;
};

export type OwnedCardStats = {
  total_cards: number;
  unique_cards: number;
  total_value: number;
};

// ============================================================
// Last-used destination (AsyncStorage)
// ============================================================

export async function getLastUsedDestination(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_DESTINATION_KEY);
}

export async function setLastUsedDestination(collectionId: string): Promise<void> {
  await AsyncStorage.setItem(LAST_DESTINATION_KEY, collectionId);
}

// ============================================================
// Queries
// ============================================================

async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

/**
 * Fetch owned card stats — sum across ALL binders only (not lists).
 *
 * Split into two RPCs: a fast quantities aggregation (no join to cards)
 * and a slower value aggregation (LEFT JOIN cards for prices). The
 * value query occasionally trips Supabase's statement_timeout on users
 * with 50k+ owned rows; if that happens we still return quantities so
 * the header paints a usable value.
 */
export async function fetchOwnedCardStats(_userId: string): Promise<OwnedCardStats> {
  const [qtyRes, valRes] = await Promise.all([
    supabase.rpc('get_owned_stats_quantities'),
    supabase.rpc('get_owned_stats_value'),
  ]);
  if (qtyRes.error) throw new Error(`Failed to fetch owned stats: ${qtyRes.error.message}`);
  const qtyRow = Array.isArray(qtyRes.data) ? qtyRes.data[0] : qtyRes.data;
  const valRow = !valRes.error && valRes.data
    ? (Array.isArray(valRes.data) ? valRes.data[0] : valRes.data)
    : null;
  return {
    total_cards: Number(qtyRow?.total_cards ?? 0),
    unique_cards: Number(qtyRow?.unique_cards ?? 0),
    total_value: Number(valRow?.total_value ?? 0),
  };
}

/**
 * Stats for a single collection. Same split as owned stats — value runs
 * as a best-effort parallel RPC so a timeout on the value aggregation
 * doesn't block the cards/unique header from rendering.
 */
export async function fetchCollectionStats(collectionId: string): Promise<OwnedCardStats> {
  const [qtyRes, valRes] = await Promise.all([
    supabase.rpc('get_collection_stats_quantities', { p_collection_id: collectionId }),
    supabase.rpc('get_collection_stats_value', { p_collection_id: collectionId }),
  ]);
  if (qtyRes.error) throw new Error(`Failed to fetch collection stats: ${qtyRes.error.message}`);
  const qtyRow = Array.isArray(qtyRes.data) ? qtyRes.data[0] : qtyRes.data;
  const valRow = !valRes.error && valRes.data
    ? (Array.isArray(valRes.data) ? valRes.data[0] : valRes.data)
    : null;
  return {
    total_cards: Number(qtyRow?.total_cards ?? 0),
    unique_cards: Number(qtyRow?.unique_cards ?? 0),
    total_value: Number(valRow?.total_value ?? 0),
  };
}

/**
 * Fetch folders for a user, filtered by type ('binder' or 'list').
 */
export async function fetchFolders(userId: string, type?: CollectionType): Promise<FolderSummary[]> {
  let query = supabase
    .from('collection_folders')
    .select('id, name, type, color')
    .eq('user_id', userId)
    .order('name');

  if (type) query = query.eq('type', type);

  const { data, error } = await query;

  if (error) throw new Error(`Failed to fetch folders: ${error.message}`);

  // Count items per folder
  const { data: collections } = await supabase
    .from('collections')
    .select('folder_id')
    .eq('user_id', userId)
    .not('folder_id', 'is', null);

  const countMap: Record<string, number> = {};
  for (const c of collections ?? []) {
    const fid = (c as any).folder_id;
    if (fid) countMap[fid] = (countMap[fid] ?? 0) + 1;
  }

  return (data ?? []).map((f: any) => ({
    id: f.id,
    name: f.name,
    type: f.type as CollectionType,
    color: f.color ?? null,
    item_count: countMap[f.id] ?? 0,
  }));
}

/**
 * Fetch binders/lists inside a specific folder.
 */
export async function fetchFolderContents(folderId: string): Promise<CollectionSummary[]> {
  // Server-side aggregation keeps counts correct regardless of collection
  // size AND uses the canonical unique-variant definition (print × finish)
  // so numbers agree with the binder detail header.
  const { data, error } = await supabase.rpc('get_folder_contents_summary', {
    p_folder_id: folderId,
  });

  if (error) throw new Error(`Failed to fetch folder contents: ${error.message}`);

  return (data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    type: c.type as CollectionType,
    folder_id: c.folder_id,
    color: c.color ?? null,
    card_count: Number(c.total_cards ?? 0),
    unique_cards: Number(c.unique_cards ?? 0),
    total_value: Number(c.total_value ?? 0),
  }));
}

/**
 * Page through collection_cards for a single collection until PostgREST
 * returns a short page. Returns all rows. Used by the detail screen when
 * the collection is large (imports of 10k+ cards).
 *
 * PostgREST caps per-request rows at `db-max-rows` (1000 by default). We
 * iterate via .range() so clients get the full set without needing the
 * server config changed.
 */
export async function fetchAllCollectionCards(
  collectionId: string,
  select: string,
  pageSize = 1000
): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('collection_cards')
      .select(select)
      .eq('collection_id', collectionId)
      .order('added_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Failed to page cards: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

/**
 * Streamed variant of fetchAllCollectionCards: returns the first page
 * synchronously for an immediate paint, then loads the rest in parallel
 * (configurable concurrency) invoking `onPage` with each new chunk.
 *
 * The first page can be smaller than the rest (`initialPageSize`) so the
 * viewport gets its first ~100 rows in ~100 ms, and the remaining pages
 * of 1k each stream in the background. Later pages start at offset
 * `initialPageSize` and chunk by `pageSize` from there.
 */
export async function fetchCollectionCardsStreamed(
  collectionId: string,
  select: string,
  onPage: (rows: any[]) => void,
  opts?: { pageSize?: number; initialPageSize?: number; concurrency?: number }
): Promise<void> {
  const pageSize = opts?.pageSize ?? 1000;
  const initialPageSize = opts?.initialPageSize ?? pageSize;
  const concurrency = opts?.concurrency ?? 6;

  // Stable ordering so pages don't overlap or skip rows.
  const fetchRange = async (from: number, to: number) => {
    const { data, error } = await supabase
      .from('collection_cards')
      .select(select)
      .eq('collection_id', collectionId)
      .order('added_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (error) throw new Error(`Failed to page cards: ${error.message}`);
    if (data && data.length > 0) onPage(data);
    return data?.length ?? 0;
  };

  // Paint the initial page immediately regardless of whether we can get
  // a count.
  const firstCount = await fetchRange(0, initialPageSize - 1);
  if (firstCount < initialPageSize) return;

  // Count the collection size to fan out pages in parallel. `exact` is
  // accurate; if it trips Supabase's statement_timeout on very large
  // collections, fall through to `estimated` (pg_class.reltuples — fast
  // but approximate). If both fail, drop to sequential pagination.
  let total: number | null = null;
  const tryCount = async (mode: 'exact' | 'estimated') => {
    const { count, error } = await supabase
      .from('collection_cards')
      .select('id', { count: mode, head: true })
      .eq('collection_id', collectionId);
    if (error) return null;
    return count ?? null;
  };
  total = await tryCount('exact');
  if (total == null) total = await tryCount('estimated');

  const startOffset = initialPageSize;

  if (total != null && total > initialPageSize) {
    const remainingRows = total - initialPageSize;
    const pages = Math.ceil(remainingRows / pageSize);

    let cursor = 0;
    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= pages) return;
        const from = startOffset + idx * pageSize;
        const to = from + pageSize - 1;
        await fetchRange(from, to);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, pages) }, worker)
    );
    return;
  }

  // No count available — page sequentially until empty.
  let offset = startOffset;
  while (true) {
    const got = await fetchRange(offset, offset + pageSize - 1);
    if (got < pageSize) break;
    offset += pageSize;
  }
}

/**
 * Streamed variant for the Owned view (multiple binders at once). Counts
 * the union first, renders the first page, then fans out the rest in
 * parallel — same contract as fetchCollectionCardsStreamed but across a
 * set of collection ids.
 */
export async function fetchCollectionCardsInStreamed(
  collectionIds: string[],
  select: string,
  onPage: (rows: any[]) => void,
  opts?: { pageSize?: number; initialPageSize?: number; concurrency?: number }
): Promise<void> {
  if (collectionIds.length === 0) return;
  const pageSize = opts?.pageSize ?? 1000;
  const initialPageSize = opts?.initialPageSize ?? pageSize;
  const concurrency = opts?.concurrency ?? 6;

  const fetchRange = async (from: number, to: number) => {
    const { data, error } = await supabase
      .from('collection_cards')
      .select(select)
      .in('collection_id', collectionIds)
      .order('added_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (error) throw new Error(`Failed to page cards: ${error.message}`);
    if (data && data.length > 0) onPage(data);
    return data?.length ?? 0;
  };

  // Always paint the initial page first so the UI has something to show.
  const firstCount = await fetchRange(0, initialPageSize - 1);
  if (firstCount < initialPageSize) return;

  // Try to learn the total up-front so we can fan out pages in parallel.
  // Owned-view counts span many binders and have been timing out on
  // `count: 'exact'` for large collections (>50k rows) — fall through to
  // the estimated count (uses pg_class.reltuples, effectively free).
  // If both fail we still work, just serially: keep pulling pages until
  // we get a short one.
  let total: number | null = null;
  const tryCount = async (mode: 'exact' | 'estimated') => {
    const { count, error } = await supabase
      .from('collection_cards')
      .select('id', { count: mode, head: true })
      .in('collection_id', collectionIds);
    if (error) return null;
    return count ?? null;
  };
  total = await tryCount('exact');
  if (total == null) total = await tryCount('estimated');

  const startOffset = initialPageSize;

  if (total != null && total > initialPageSize) {
    const remainingRows = total - initialPageSize;
    const pages = Math.ceil(remainingRows / pageSize);

    let cursor = 0;
    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= pages) return;
        const from = startOffset + idx * pageSize;
        const to = from + pageSize - 1;
        await fetchRange(from, to);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, pages) }, worker)
    );
    return;
  }

  // Fallback: no reliable count. Page sequentially until a short page
  // signals end-of-data. Slower on huge collections but bulletproof.
  let offset = startOffset;
  while (true) {
    const got = await fetchRange(offset, offset + pageSize - 1);
    if (got < pageSize) break;
    offset += pageSize;
  }
}

/**
 * Same idea for the Owned view — pages across any set of collection ids.
 */
export async function fetchAllCollectionCardsIn(
  collectionIds: string[],
  select: string,
  pageSize = 1000
): Promise<any[]> {
  if (collectionIds.length === 0) return [];
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('collection_cards')
      .select(select)
      .in('collection_id', collectionIds)
      .order('added_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Failed to page cards: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

// ============================================================
// Mutations
// ============================================================

export async function createCollection(params: {
  name: string;
  type: CollectionType;
  folderId?: string;
  color?: string;
  description?: string;
}): Promise<string> {
  const userId = await getUserId();

  const { data, error } = await supabase
    .from('collections')
    .insert({
      user_id: userId,
      name: params.name,
      type: params.type,
      folder_id: params.folderId ?? null,
      color: params.color ?? null,
      description: params.description ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create collection: ${error.message}`);
  return data.id;
}

export async function createFolder(name: string, type: CollectionType, color?: string): Promise<string> {
  const userId = await getUserId();

  const { data, error } = await supabase
    .from('collection_folders')
    .insert({ user_id: userId, name, type, color: color ?? null })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create folder: ${error.message}`);
  return data.id;
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('collections')
    .update({ name })
    .eq('id', id);

  if (error) throw new Error(`Failed to rename collection: ${error.message}`);
}

export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase
    .from('collections')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete collection: ${error.message}`);
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('collection_folders')
    .update({ name })
    .eq('id', id);

  if (error) throw new Error(`Failed to rename folder: ${error.message}`);
}

export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase
    .from('collection_folders')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete folder: ${error.message}`);
}

/**
 * Duplicate a collection (binder or list) with all its cards.
 * New name = `${original} Copy` unless a custom name is passed.
 *
 * Local-first: parent + all children are inserted into SQLite in a single
 * transaction; the hub picks the new collection up on the next useQuery
 * tick (reactive). The PowerSync CRUD queue uploads the rows in the
 * background — on a 100k-card binder the upload is slow but non-blocking
 * and fully offline-capable, which is the whole point.
 */
export async function duplicateCollection(sourceId: string, newName?: string): Promise<string> {
  // For the overlay copy only; the actual insert count comes from the
  // local query inside duplicateCollectionLocal.
  const expected = await localCountForCollection(sourceId);

  overlay.show(
    'Duplicating collection',
    expected > 0 ? `Copying ${expected.toLocaleString()} cards…` : 'Preparing…'
  );

  try {
    const newId = await duplicateCollectionLocal(sourceId, newName);
    invalidateNamespace('owned');
    invalidateNamespace('owned_stats');
    return newId;
  } finally {
    overlay.hide();
  }
}

/**
 * Merge source collection into destination. Quantities sum on conflict
 * (same card_id / condition / language). Source is deleted after merge.
 *
 * Local-first: all writes land in SQLite in a single writeTransaction;
 * the batching connector uploads them in the background. Works offline.
 * We deliberately do NOT call the server-side merge RPC — unlike delete
 * or empty, merge SUMS quantities and is not idempotent, so running both
 * local and remote would double the moved totals.
 */
export async function mergeCollections(sourceId: string, destinationId: string): Promise<void> {
  const sourceCount = await localCountForCollection(sourceId);

  overlay.show(
    'Merging collections',
    sourceCount > 0 ? `Moving ${sourceCount.toLocaleString()} cards…` : 'Preparing…'
  );

  try {
    await mergeCollectionsLocal(sourceId, destinationId);

    invalidateCache('collection', sourceId);
    invalidateCache('collection', destinationId);
    invalidateCache('collection_stats', sourceId);
    invalidateCache('collection_stats', destinationId);
    invalidateNamespace('owned');
    invalidateNamespace('owned_stats');
  } finally {
    overlay.hide();
  }
}

/**
 * Remove every card from the collection while keeping the collection row
 * (name, color, folder, type, description). Returns the number of rows
 * removed — useful for a confirmation toast.
 */
export async function emptyCollection(collectionId: string): Promise<number> {
  const initial = await localCountForCollection(collectionId);

  overlay.show(
    'Emptying collection',
    initial > 0 ? `Removing ${initial.toLocaleString()} cards…` : 'Preparing…'
  );

  try {
    const { data, error } = await supabase.rpc('sp_empty_collection', {
      p_collection_id: collectionId,
    });
    if (error) throw new Error(`Failed to empty collection: ${error.message}`);

    overlay.update('Waiting for sync…');
    const start = Date.now();
    while (Date.now() - start < SYNC_WAIT_MAX_MS) {
      const remaining = await localCountForCollection(collectionId);
      if (remaining === 0) break;
      await new Promise((r) => setTimeout(r, SYNC_WAIT_POLL_MS));
    }

    invalidateCache('collection', collectionId);
    invalidateCache('collection_stats', collectionId);
    invalidateNamespace('owned');
    invalidateNamespace('owned_stats');
    return Number(data ?? 0);
  } finally {
    overlay.hide();
  }
}

/**
 * Move a collection into a folder (or remove from folder with folderId=null).
 */
export async function moveToFolder(collectionId: string, folderId: string | null): Promise<void> {
  const { error } = await supabase
    .from('collections')
    .update({ folder_id: folderId })
    .eq('id', collectionId);

  if (error) throw new Error(`Failed to move collection: ${error.message}`);
}

/**
 * Delete a folder and all collections inside it (cascade).
 */
export async function deleteFolderWithContents(folderId: string): Promise<void> {
  // Delete all collections in this folder (cards cascade via FK)
  const { error: colErr } = await supabase
    .from('collections')
    .delete()
    .eq('folder_id', folderId);

  if (colErr) throw new Error(`Failed to delete folder contents: ${colErr.message}`);

  // Delete the folder itself
  await deleteFolder(folderId);
}

