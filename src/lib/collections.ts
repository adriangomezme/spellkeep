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
 * Fetch all binders and lists with card counts and values.
 */
export async function fetchCollectionSummaries(userId: string): Promise<CollectionSummary[]> {
  const { data, error } = await supabase
    .from('collections')
    .select(`
      id, name, type, folder_id, color,
      collection_cards (
        quantity_normal, quantity_foil, quantity_etched,
        cards ( price_usd, price_usd_foil )
      )
    `)
    .eq('user_id', userId)
    .order('type')
    .order('name');

  if (error) throw new Error(`Failed to fetch collections: ${error.message}`);

  return (data ?? []).map((c: any) => {
    let card_count = 0;
    let total_value = 0;
    const entries = c.collection_cards ?? [];

    for (const cc of entries) {
      const qty = (cc.quantity_normal ?? 0) + (cc.quantity_foil ?? 0) + (cc.quantity_etched ?? 0);
      card_count += qty;

      const card = cc.cards;
      if (card?.price_usd) total_value += card.price_usd * (cc.quantity_normal ?? 0);
      if (card?.price_usd_foil) {
        total_value += card.price_usd_foil * (cc.quantity_foil ?? 0);
        total_value += card.price_usd_foil * (cc.quantity_etched ?? 0);
      } else if (card?.price_usd) {
        total_value += card.price_usd * (cc.quantity_etched ?? 0);
      }
    }

    return {
      id: c.id,
      name: c.name,
      type: c.type as CollectionType,
      folder_id: c.folder_id,
      color: c.color ?? null,
      card_count,
      unique_cards: entries.length,
      total_value,
    };
  });
}

/**
 * Fetch owned card stats — sum across ALL binders only (not lists).
 */
export async function fetchOwnedCardStats(userId: string): Promise<OwnedCardStats> {
  const { data, error } = await supabase
    .from('collections')
    .select(`
      id, type,
      collection_cards (
        quantity_normal, quantity_foil, quantity_etched,
        cards ( price_usd, price_usd_foil )
      )
    `)
    .eq('user_id', userId)
    .eq('type', 'binder');

  if (error) throw new Error(`Failed to fetch owned stats: ${error.message}`);

  let total_cards = 0;
  let unique_cards = 0;
  let total_value = 0;

  for (const binder of data ?? []) {
    for (const cc of (binder as any).collection_cards ?? []) {
      const qty = (cc.quantity_normal ?? 0) + (cc.quantity_foil ?? 0) + (cc.quantity_etched ?? 0);
      total_cards += qty;
      unique_cards += 1;

      const card = cc.cards;
      if (card?.price_usd) total_value += card.price_usd * (cc.quantity_normal ?? 0);
      if (card?.price_usd_foil) {
        total_value += card.price_usd_foil * (cc.quantity_foil ?? 0);
        total_value += card.price_usd_foil * (cc.quantity_etched ?? 0);
      } else if (card?.price_usd) {
        total_value += card.price_usd * (cc.quantity_etched ?? 0);
      }
    }
  }

  return { total_cards, unique_cards, total_value };
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
  const { data, error } = await supabase
    .from('collections')
    .select(`
      id, name, type, folder_id, color,
      collection_cards (
        quantity_normal, quantity_foil, quantity_etched,
        cards ( price_usd, price_usd_foil )
      )
    `)
    .eq('folder_id', folderId)
    .order('type')
    .order('name');

  if (error) throw new Error(`Failed to fetch folder contents: ${error.message}`);

  return (data ?? []).map((c: any) => {
    let card_count = 0;
    let total_value = 0;
    const entries = c.collection_cards ?? [];

    for (const cc of entries) {
      const qty = (cc.quantity_normal ?? 0) + (cc.quantity_foil ?? 0) + (cc.quantity_etched ?? 0);
      card_count += qty;

      const card = cc.cards;
      if (card?.price_usd) total_value += card.price_usd * (cc.quantity_normal ?? 0);
      if (card?.price_usd_foil) {
        total_value += card.price_usd_foil * (cc.quantity_foil ?? 0);
        total_value += card.price_usd_foil * (cc.quantity_etched ?? 0);
      } else if (card?.price_usd) {
        total_value += card.price_usd * (cc.quantity_etched ?? 0);
      }
    }

    return {
      id: c.id,
      name: c.name,
      type: c.type as CollectionType,
      folder_id: c.folder_id,
      color: c.color ?? null,
      card_count,
      unique_cards: entries.length,
      total_value,
    };
  });
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
 * New name = original name + " Copy"
 */
export async function duplicateCollection(sourceId: string): Promise<string> {
  const userId = await getUserId();

  // Fetch source
  const { data: source, error: srcErr } = await supabase
    .from('collections')
    .select('name, type, folder_id, color, description')
    .eq('id', sourceId)
    .single();

  if (srcErr || !source) throw new Error('Source collection not found');

  // Create copy
  const { data: newCol, error: createErr } = await supabase
    .from('collections')
    .insert({
      user_id: userId,
      name: `${source.name} Copy`,
      type: source.type,
      folder_id: source.folder_id,
      color: source.color,
      description: source.description,
    })
    .select('id')
    .single();

  if (createErr || !newCol) throw new Error(`Failed to duplicate: ${createErr?.message}`);

  // Copy all cards
  const { data: cards } = await supabase
    .from('collection_cards')
    .select('card_id, condition, quantity_normal, quantity_foil, quantity_etched, tags, notes')
    .eq('collection_id', sourceId);

  if (cards && cards.length > 0) {
    const rows = cards.map((c: any) => ({
      collection_id: newCol.id,
      card_id: c.card_id,
      condition: c.condition,
      quantity_normal: c.quantity_normal,
      quantity_foil: c.quantity_foil,
      quantity_etched: c.quantity_etched,
      tags: c.tags,
      notes: c.notes,
    }));

    const { error: insertErr } = await supabase
      .from('collection_cards')
      .insert(rows);

    if (insertErr) throw new Error(`Failed to copy cards: ${insertErr.message}`);
  }

  return newCol.id;
}

/**
 * Merge source collection into destination.
 * Cards from source are added to destination (quantities merged if same card+condition).
 * Source is deleted after merge.
 */
export async function mergeCollections(sourceId: string, destinationId: string): Promise<void> {
  // Fetch source cards
  const { data: sourceCards } = await supabase
    .from('collection_cards')
    .select('card_id, condition, quantity_normal, quantity_foil, quantity_etched')
    .eq('collection_id', sourceId);

  if (!sourceCards || sourceCards.length === 0) {
    // Nothing to merge, just delete source
    await deleteCollection(sourceId);
    return;
  }

  // Fetch destination cards for matching
  const { data: destCards } = await supabase
    .from('collection_cards')
    .select('id, card_id, condition, quantity_normal, quantity_foil, quantity_etched')
    .eq('collection_id', destinationId);

  const destMap = new Map<string, any>();
  for (const dc of destCards ?? []) {
    destMap.set(`${dc.card_id}_${dc.condition}`, dc);
  }

  const toInsert: any[] = [];
  const toUpdate: { id: string; updates: any }[] = [];

  for (const sc of sourceCards as any[]) {
    const key = `${sc.card_id}_${sc.condition}`;
    const existing = destMap.get(key);

    if (existing) {
      toUpdate.push({
        id: existing.id,
        updates: {
          quantity_normal: existing.quantity_normal + sc.quantity_normal,
          quantity_foil: existing.quantity_foil + sc.quantity_foil,
          quantity_etched: existing.quantity_etched + sc.quantity_etched,
        },
      });
    } else {
      toInsert.push({
        collection_id: destinationId,
        card_id: sc.card_id,
        condition: sc.condition,
        quantity_normal: sc.quantity_normal,
        quantity_foil: sc.quantity_foil,
        quantity_etched: sc.quantity_etched,
      });
    }
  }

  // Execute updates
  for (const { id, updates } of toUpdate) {
    await supabase.from('collection_cards').update(updates).eq('id', id);
  }

  // Execute inserts
  if (toInsert.length > 0) {
    await supabase.from('collection_cards').insert(toInsert);
  }

  // Delete source
  await deleteCollection(sourceId);
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
