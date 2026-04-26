import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './powersync';
import { overlay } from './uiStore';
import { duplicateCollectionLocal, mergeCollectionsLocal } from './collections.local';

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

const LAST_DESTINATION_KEY = 'spellkeep_last_destination';

export async function getLastUsedDestination(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_DESTINATION_KEY);
}

export async function setLastUsedDestination(collectionId: string): Promise<void> {
  await AsyncStorage.setItem(LAST_DESTINATION_KEY, collectionId);
}

// ============================================================
// Default tags per destination (AsyncStorage)
// ============================================================
// Persisted last set of tag ids the user picked when adding a card to
// a given binder/list. Surfaces in the destination-with-tags picker
// as a pre-selection so a typical "always tag this binder with X"
// workflow is one tap, not three.
//
// Storage key: @spellkeep/default_tags.{collectionId}.v1
// Value: JSON-stringified array of tag ids.

function defaultTagsKey(collectionId: string): string {
  return `@spellkeep/default_tags.${collectionId}.v1`;
}

export async function getDefaultTagsForDestination(
  collectionId: string,
): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(defaultTagsKey(collectionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    return [];
  }
}

export async function setDefaultTagsForDestination(
  collectionId: string,
  tagIds: string[],
): Promise<void> {
  if (tagIds.length === 0) {
    await AsyncStorage.removeItem(defaultTagsKey(collectionId));
    return;
  }
  await AsyncStorage.setItem(
    defaultTagsKey(collectionId),
    JSON.stringify(tagIds),
  );
}

// ============================================================
// Overlay-wrapped mutations
// ============================================================

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
    return await duplicateCollectionLocal(sourceId, newName);
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
  } finally {
    overlay.hide();
  }
}
