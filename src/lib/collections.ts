import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

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
 * Fetch all binders and lists with card counts and values. Stats come from
 * a server-side RPC so we don't hit PostgREST's default max_rows=1000 limit
 * when summing child rows (collections with >1k unique entries used to show
 * truncated totals — see bug fix in migration 00014).
 */
export async function fetchCollectionSummaries(_userId: string): Promise<CollectionSummary[]> {
  const { data, error } = await supabase.rpc('get_user_collection_summaries', { p_type: null });
  if (error) throw new Error(`Failed to fetch collections: ${error.message}`);

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
 * Fetch owned card stats — sum across ALL binders only (not lists).
 * Uses the get_owned_stats RPC to avoid the 1000-row truncation bug.
 */
export async function fetchOwnedCardStats(_userId: string): Promise<OwnedCardStats> {
  const { data, error } = await supabase.rpc('get_owned_stats');
  if (error) throw new Error(`Failed to fetch owned stats: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    total_cards: Number(row?.total_cards ?? 0),
    unique_cards: Number(row?.unique_cards ?? 0),
    total_value: Number(row?.total_value ?? 0),
  };
}

/**
 * Stats for a single collection. Used by the detail screen header so the
 * totals stay correct even before all rows finish loading.
 */
export async function fetchCollectionStats(collectionId: string): Promise<OwnedCardStats> {
  const { data, error } = await supabase.rpc('get_collection_stats', { p_collection_id: collectionId });
  if (error) throw new Error(`Failed to fetch collection stats: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    total_cards: Number(row?.total_cards ?? 0),
    unique_cards: Number(row?.unique_cards ?? 0),
    total_value: Number(row?.total_value ?? 0),
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

  // Count the collection size cheaply so we can fan out pages without
  // overshooting. `head: true` skips the body; we only want the Content-
  // Range total.
  const { count } = await supabase
    .from('collection_cards')
    .select('id', { count: 'exact', head: true })
    .eq('collection_id', collectionId);

  const total = count ?? 0;
  if (total === 0) return;

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
  };

  // Small initial page so the FlatList viewport has content as soon as
  // possible — the rest streams in after.
  await fetchRange(0, Math.min(initialPageSize, total) - 1);
  if (total <= initialPageSize) return;

  // Remaining rows paginated by `pageSize`, starting right after the
  // initial page so we don't re-fetch or skip any rows.
  const remainingRows = total - initialPageSize;
  const pages = Math.ceil(remainingRows / pageSize);
  const startOffset = initialPageSize;

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

  const { count } = await supabase
    .from('collection_cards')
    .select('id', { count: 'exact', head: true })
    .in('collection_id', collectionIds);

  const total = count ?? 0;
  if (total === 0) return;

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
  };

  await fetchRange(0, Math.min(initialPageSize, total) - 1);
  if (total <= initialPageSize) return;

  const remainingRows = total - initialPageSize;
  const pages = Math.ceil(remainingRows / pageSize);
  const startOffset = initialPageSize;

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
 * Runs as a single server-side RPC — one SQL statement inserts all the
 * child rows regardless of scale, so a 100k-card binder copies in the
 * same time as a 10-card one.
 */
export async function duplicateCollection(sourceId: string, newName?: string): Promise<string> {
  const { data, error } = await supabase.rpc('sp_duplicate_collection', {
    p_source_id: sourceId,
    p_new_name: newName ?? null,
  });
  if (error) throw new Error(`Failed to duplicate: ${error.message}`);
  if (!data) throw new Error('Duplicate returned no id');
  return data as string;
}

/**
 * Merge source collection into destination. Quantities sum on conflict.
 * Source is deleted after merge. Runs as a single server-side RPC so
 * even binders with hundreds of thousands of entries finish in seconds.
 */
export async function mergeCollections(sourceId: string, destinationId: string): Promise<void> {
  const { error } = await supabase.rpc('sp_merge_collections', {
    p_source_id: sourceId,
    p_dest_id: destinationId,
  });
  if (error) throw new Error(`Failed to merge: ${error.message}`);
}

/**
 * Remove every card from the collection while keeping the collection row
 * (name, color, folder, type, description). Returns the number of rows
 * removed — useful for a confirmation toast.
 */
export async function emptyCollection(collectionId: string): Promise<number> {
  const { data, error } = await supabase.rpc('sp_empty_collection', {
    p_collection_id: collectionId,
  });
  if (error) throw new Error(`Failed to empty collection: ${error.message}`);
  return Number(data ?? 0);
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

/**
 * Get the user's default binder ID ("My Cards").
 * This replaces the old getDefaultCollectionId().
 */
export async function getDefaultBinderId(): Promise<string> {
  const userId = await getUserId();

  const { data, error } = await supabase
    .from('collections')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'binder')
    .eq('name', 'My Cards')
    .single();

  if (error || !data) throw new Error('Default binder not found');
  return data.id;
}
