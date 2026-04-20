import { db } from './powersync/system';
import { supabase } from './supabase';
import type { CollectionType } from './collections';
import type { ScryfallCard } from './scryfall';
import type { Condition, Finish } from './collection';
import { ensureCardExists } from './collection';

// ─────────────────────────────────────────────────────────────────────────
// Local-first variants of the folder / collection mutations. Writes land
// directly in the PowerSync SQLite tables; the SupabaseConnector drains the
// CRUD queue to Supabase whenever the device is online. Reads happen
// through the @powersync/react `useQuery` hook in the screens themselves.
// ─────────────────────────────────────────────────────────────────────────

// Read the user id from the local session cache rather than hitting the
// auth server. supabase.auth.getUser() performs a network round-trip to
// validate the JWT, which fails offline — breaking airplane-mode writes.
// getSession() is backed by AsyncStorage and works without a radio.
async function getUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  return session.user.id;
}

// RFC 4122 v4 UUID using Math.random — good enough for client-side keys that
// will be reconciled server-side. Avoids a native dependency on ExpoCrypto so
// local creates work in Expo Go / dev clients without a rebuild.
function newId(): string {
  const hex: string[] = [];
  for (let i = 0; i < 256; i++) hex[i] = (i < 16 ? '0' : '') + i.toString(16);
  const r0 = (Math.random() * 0x100000000) >>> 0;
  const r1 = (Math.random() * 0x100000000) >>> 0;
  const r2 = (Math.random() * 0x100000000) >>> 0;
  const r3 = (Math.random() * 0x100000000) >>> 0;
  return (
    hex[r0 & 0xff] + hex[(r0 >>> 8) & 0xff] + hex[(r0 >>> 16) & 0xff] + hex[(r0 >>> 24) & 0xff] + '-' +
    hex[r1 & 0xff] + hex[(r1 >>> 8) & 0xff] + '-' +
    hex[((r1 >>> 16) & 0x0f) | 0x40] + hex[(r1 >>> 24) & 0xff] + '-' +
    hex[(r2 & 0x3f) | 0x80] + hex[(r2 >>> 8) & 0xff] + '-' +
    hex[(r2 >>> 16) & 0xff] + hex[(r2 >>> 24) & 0xff] +
    hex[r3 & 0xff] + hex[(r3 >>> 8) & 0xff] + hex[(r3 >>> 16) & 0xff] + hex[(r3 >>> 24) & 0xff]
  );
}

export async function createCollectionLocal(params: {
  name: string;
  type: CollectionType;
  folderId?: string | null;
  color?: string | null;
  description?: string | null;
}): Promise<string> {
  const userId = await getUserId();
  const id = newId();
  const now = new Date().toISOString();
  // Omit is_public and share_token — Supabase sets defaults, and including
  // integer 0 for the boolean is_public column trips PostgREST type coercion.
  await db.execute(
    `INSERT INTO collections
       (id, user_id, name, type, folder_id, color, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      params.name,
      params.type,
      params.folderId ?? null,
      params.color ?? null,
      params.description ?? null,
      now,
      now,
    ]
  );
  return id;
}

export async function createFolderLocal(
  name: string,
  type: CollectionType,
  color?: string | null
): Promise<string> {
  const userId = await getUserId();
  const id = newId();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO collection_folders
       (id, user_id, name, type, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, name, type, color ?? null, now, now]
  );
  return id;
}

export async function renameCollectionLocal(id: string, name: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE collections SET name = ?, updated_at = ? WHERE id = ?`,
    [name, now, id]
  );
}

export async function renameFolderLocal(id: string, name: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE collection_folders SET name = ?, updated_at = ? WHERE id = ?`,
    [name, now, id]
  );
}

export async function updateCollectionColorLocal(
  id: string,
  color: string | null
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE collections SET color = ?, updated_at = ? WHERE id = ?`,
    [color, now, id]
  );
}

export async function updateFolderColorLocal(
  id: string,
  color: string | null
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE collection_folders SET color = ?, updated_at = ? WHERE id = ?`,
    [color, now, id]
  );
}

export async function deleteCollectionLocal(id: string): Promise<void> {
  // Optimistic UI: drop the local parent row immediately so the hub
  // hides the entry on the next useQuery tick (no modal, no waiting).
  //
  // Critical: we ALSO purge pending `ps_crud` writes that target this
  // collection. Without this, the background RPC below races with the
  // upload loop: if it wipes the server-side parent before pending
  // INSERTs for this collection's cards finish uploading, those INSERTs
  // hit the `EXISTS(parent)` RLS check and fail 42501. The failed
  // transactions are then discarded as fatal, dropping valid work from
  // other collections that happened to be queued in the same tx.
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `DELETE FROM ps_crud
        WHERE json_extract(data, '$.type') = 'collection_cards'
          AND json_extract(data, '$.data.collection_id') = ?`,
      [id]
    );
    await tx.execute(
      `DELETE FROM ps_crud
        WHERE json_extract(data, '$.type') = 'collections'
          AND json_extract(data, '$.id') = ?
          AND json_extract(data, '$.op') = 'PUT'`,
      [id]
    );
    await tx.execute(`DELETE FROM collections WHERE id = ?`, [id]);
  });

  // Fire the server-side bulk RPC in the background. The server FK
  // cascade handles child rows; the local tombstones arrive via the
  // sync stream. `collection_cards` rows for the removed parent stay
  // in local SQLite until that tombstone lands — nothing queries them
  // without the parent, so the hub shows the binder as gone instantly.
  supabase.rpc('sp_delete_collection', { p_collection_id: id })
    .then(({ error }) => {
      if (error) console.warn('[deleteCollectionLocal] background RPC failed', error.message);
    });
}

export async function deleteFolderLocal(id: string): Promise<void> {
  await db.execute(`DELETE FROM collection_folders WHERE id = ?`, [id]);
}

export async function deleteFolderWithContentsLocal(id: string): Promise<void> {
  // Same ps_crud purge pattern as deleteCollectionLocal — cancel any
  // pending writes targeting this folder's children so they don't
  // race the server-side cascade and fail RLS.
  await db.writeTransaction(async (tx) => {
    const children = await tx.getAll<{ id: string }>(
      `SELECT id FROM collections WHERE folder_id = ?`,
      [id]
    );
    for (const child of children) {
      await tx.execute(
        `DELETE FROM ps_crud
          WHERE json_extract(data, '$.type') = 'collection_cards'
            AND json_extract(data, '$.data.collection_id') = ?`,
        [child.id]
      );
      await tx.execute(
        `DELETE FROM ps_crud
          WHERE json_extract(data, '$.type') = 'collections'
            AND json_extract(data, '$.id') = ?
            AND json_extract(data, '$.op') = 'PUT'`,
        [child.id]
      );
      await tx.execute(`DELETE FROM collections WHERE id = ?`, [child.id]);
    }
    await tx.execute(
      `DELETE FROM ps_crud
        WHERE json_extract(data, '$.type') = 'collection_folders'
          AND json_extract(data, '$.id') = ?
          AND json_extract(data, '$.op') = 'PUT'`,
      [id]
    );
    await tx.execute(`DELETE FROM collection_folders WHERE id = ?`, [id]);
  });

  supabase.rpc('sp_delete_folder_with_contents', { p_folder_id: id })
    .then(({ error }) => {
      if (error) console.warn('[deleteFolderWithContentsLocal] background RPC failed', error.message);
    });
}

export async function moveToFolderLocal(
  collectionId: string,
  folderId: string | null
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE collections SET folder_id = ?, updated_at = ? WHERE id = ?`,
    [folderId, now, collectionId]
  );
}

/**
 * Duplicate a collection locally: clone the parent row with a new id and
 * copy every child `collection_cards` row with fresh ids. All writes land
 * in local SQLite; the PowerSync CRUD queue uploads them in the background.
 *
 * We do NOT call `sp_duplicate_collection` here — that RPC generates its
 * own collection id server-side, so running it in parallel with local
 * inserts would duplicate the binder (one client-generated id + one
 * server-generated). Local-first is strictly correct and lets duplicate
 * work offline; the only cost is upload time for the CRUD queue on
 * huge binders, which drains in the background without blocking the UI.
 */
export async function duplicateCollectionLocal(
  sourceId: string,
  newName?: string
): Promise<string> {
  const userId = await getUserId();
  const newCollectionId = newId();
  const now = new Date().toISOString();

  const parentRows = await db.getAll<{
    name: string;
    type: CollectionType;
    folder_id: string | null;
    color: string | null;
    description: string | null;
  }>(
    `SELECT name, type, folder_id, color, description
       FROM collections WHERE id = ? LIMIT 1`,
    [sourceId]
  );
  if (parentRows.length === 0) throw new Error('Source collection not found');
  const parent = parentRows[0];
  const finalName = newName && newName.trim().length > 0 ? newName.trim() : `${parent.name} Copy`;

  const children = await db.getAll<{
    card_id: string;
    condition: string;
    language: string;
    quantity_normal: number;
    quantity_foil: number;
    quantity_etched: number;
    purchase_price: number | null;
  }>(
    `SELECT card_id, condition, language,
            quantity_normal, quantity_foil, quantity_etched, purchase_price
       FROM collection_cards WHERE collection_id = ?`,
    [sourceId]
  );

  // Batch INSERTs keep the SQLite round-trip count manageable on huge
  // binders. With 12 params per row, 80 rows = 960 params — comfortably
  // under SQLite's 999-param limit.
  const BATCH = 80;

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO collections
         (id, user_id, name, type, folder_id, color, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newCollectionId,
        userId,
        finalName,
        parent.type,
        parent.folder_id,
        parent.color,
        parent.description,
        now,
        now,
      ]
    );

    for (let i = 0; i < children.length; i += BATCH) {
      const slice = children.slice(i, i + BATCH);
      const placeholders = slice.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const params: any[] = [];
      for (const c of slice) {
        params.push(
          newId(),
          userId,
          newCollectionId,
          c.card_id,
          c.condition,
          c.language,
          c.quantity_normal,
          c.quantity_foil,
          c.quantity_etched,
          c.purchase_price,
          now,
          now
        );
      }
      await tx.execute(
        `INSERT INTO collection_cards
           (id, user_id, collection_id, card_id, condition, language,
            quantity_normal, quantity_foil, quantity_etched,
            purchase_price, added_at, updated_at)
         VALUES ${placeholders}`,
        params
      );
    }
  });

  return newCollectionId;
}

/**
 * Bulk upsert rows into a collection local-first. Replaces the server
 * RPC path used by the import pipeline so imports work offline too.
 *
 * Same strategy as mergeCollectionsLocal: for rows whose
 * (card_id, condition, language) tuple already exists in the dest, we
 * replace the old row with a fresh one that has the merged quantities
 * (DELETE old + INSERT new). This avoids emitting PATCH ops, which the
 * connector can't safely batch because Supabase's upsert evaluates both
 * INSERT and UPDATE RLS and a partial PATCH payload fails the INSERT
 * check. All writes are PUT + DELETE, batched efficiently.
 *
 * Returns counts compatible with the server RPC's shape:
 *   • imported         — sum of qty across rows that didn't exist before
 *   • updated          — sum of qty delta added to pre-existing rows
 *   • imported_variants — count of finishes (>0 qty) on new rows
 *   • updated_variants — count of finishes (>0 qty) on rows after bump
 */
export type BulkUpsertRow = {
  card_id: string;
  condition: string;
  language: string;
  quantity_normal: number;
  quantity_foil: number;
  quantity_etched: number;
  purchase_price?: number | null;
};
export type BulkUpsertStats = {
  imported: number;
  updated: number;
  imported_variants: number;
  updated_variants: number;
};
export async function bulkUpsertCollectionCardsLocal(
  collectionId: string,
  rows: BulkUpsertRow[]
): Promise<BulkUpsertStats> {
  if (rows.length === 0) {
    return { imported: 0, updated: 0, imported_variants: 0, updated_variants: 0 };
  }

  const userId = await getUserId();
  const now = new Date().toISOString();

  // Pre-load existing rows for this collection into a (card_id|cond|lang)
  // map. Avoids N SELECTs inside the write transaction.
  type Existing = {
    id: string;
    quantity_normal: number;
    quantity_foil: number;
    quantity_etched: number;
    purchase_price: number | null;
  };
  const existingRows = await db.getAll<Existing & {
    card_id: string;
    condition: string;
    language: string;
  }>(
    `SELECT id, card_id, condition, language,
            quantity_normal, quantity_foil, quantity_etched, purchase_price
       FROM collection_cards WHERE collection_id = ?`,
    [collectionId]
  );
  const existingMap = new Map<string, Existing>();
  for (const r of existingRows) {
    existingMap.set(`${r.card_id}|${r.condition}|${r.language}`, {
      id: r.id,
      quantity_normal: r.quantity_normal ?? 0,
      quantity_foil: r.quantity_foil ?? 0,
      quantity_etched: r.quantity_etched ?? 0,
      purchase_price: r.purchase_price,
    });
  }

  const inserts: Array<{
    id: string;
    card_id: string;
    condition: string;
    language: string;
    quantity_normal: number;
    quantity_foil: number;
    quantity_etched: number;
    purchase_price: number | null;
  }> = [];
  const staleIds: string[] = [];

  let imported = 0;
  let updated = 0;
  let imported_variants = 0;
  let updated_variants = 0;

  for (const r of rows) {
    const qn = r.quantity_normal ?? 0;
    const qf = r.quantity_foil ?? 0;
    const qe = r.quantity_etched ?? 0;
    if (qn + qf + qe <= 0) continue;

    const key = `${r.card_id}|${r.condition}|${r.language}`;
    const hit = existingMap.get(key);
    if (hit) {
      // Merge into existing: replace the row with a new one summing qtys.
      staleIds.push(hit.id);
      const merged = {
        id: newId(),
        card_id: r.card_id,
        condition: r.condition,
        language: r.language,
        quantity_normal: hit.quantity_normal + qn,
        quantity_foil: hit.quantity_foil + qf,
        quantity_etched: hit.quantity_etched + qe,
        purchase_price:
          r.purchase_price != null ? r.purchase_price : hit.purchase_price,
      };
      existingMap.set(key, {
        id: merged.id,
        quantity_normal: merged.quantity_normal,
        quantity_foil: merged.quantity_foil,
        quantity_etched: merged.quantity_etched,
        purchase_price: merged.purchase_price,
      });
      inserts.push(merged);
      updated += qn + qf + qe;
      updated_variants +=
        (merged.quantity_normal > 0 ? 1 : 0) +
        (merged.quantity_foil > 0 ? 1 : 0) +
        (merged.quantity_etched > 0 ? 1 : 0);
    } else {
      const row = {
        id: newId(),
        card_id: r.card_id,
        condition: r.condition,
        language: r.language,
        quantity_normal: qn,
        quantity_foil: qf,
        quantity_etched: qe,
        purchase_price: r.purchase_price ?? null,
      };
      existingMap.set(key, {
        id: row.id,
        quantity_normal: row.quantity_normal,
        quantity_foil: row.quantity_foil,
        quantity_etched: row.quantity_etched,
        purchase_price: row.purchase_price,
      });
      inserts.push(row);
      imported += qn + qf + qe;
      imported_variants +=
        (qn > 0 ? 1 : 0) + (qf > 0 ? 1 : 0) + (qe > 0 ? 1 : 0);
    }
  }

  const INS_BATCH = 80;
  const DEL_BATCH = 500;

  await db.writeTransaction(async (tx) => {
    // DELETE stale rows FIRST so the server-side unique constraint on
    // (collection_id, card_id, condition, language) doesn't reject the
    // INSERTs that follow in the upload queue.
    for (let i = 0; i < staleIds.length; i += DEL_BATCH) {
      const slice = staleIds.slice(i, i + DEL_BATCH);
      const placeholders = slice.map(() => '?').join(', ');
      await tx.execute(
        `DELETE FROM collection_cards WHERE id IN (${placeholders})`,
        slice
      );
    }

    // Batch INSERTs.
    for (let i = 0; i < inserts.length; i += INS_BATCH) {
      const slice = inserts.slice(i, i + INS_BATCH);
      const placeholders = slice.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const params: any[] = [];
      for (const r of slice) {
        params.push(
          r.id,
          userId,
          collectionId,
          r.card_id,
          r.condition,
          r.language,
          r.quantity_normal,
          r.quantity_foil,
          r.quantity_etched,
          r.purchase_price,
          now,
          now
        );
      }
      await tx.execute(
        `INSERT INTO collection_cards
           (id, user_id, collection_id, card_id, condition, language,
            quantity_normal, quantity_foil, quantity_etched,
            purchase_price, added_at, updated_at)
         VALUES ${placeholders}`,
        params
      );
    }
  });

  return { imported, updated, imported_variants, updated_variants };
}

/**
 * Merge every card from `sourceId` into `destinationId`, summing
 * quantities on conflict (same card_id / condition / language). The
 * source collection is deleted at the end, matching the server RPC's
 * contract.
 *
 * Pure local-first: we do NOT call `sp_merge_collections` in parallel.
 * Unlike delete/empty, merge is NOT idempotent — running the RPC while
 * local inserts are in flight would sum the quantities twice. All
 * writes happen in SQLite; PowerSync uploads them in the background
 * and the batching connector keeps the round-trip count sane.
 *
 * Returns the number of source rows processed.
 */
export async function mergeCollectionsLocal(
  sourceId: string,
  destinationId: string
): Promise<number> {
  if (sourceId === destinationId) throw new Error('Cannot merge into same collection');

  const userId = await getUserId();
  const now = new Date().toISOString();

  const sourceChildren = await db.getAll<{
    card_id: string;
    condition: string;
    language: string;
    quantity_normal: number;
    quantity_foil: number;
    quantity_etched: number;
    purchase_price: number | null;
  }>(
    `SELECT card_id, condition, language,
            quantity_normal, quantity_foil, quantity_etched, purchase_price
       FROM collection_cards WHERE collection_id = ?`,
    [sourceId]
  );

  // Pre-load dest rows into a (card_id|condition|language) map so the
  // merge loop avoids N SELECTs — at 100k rows that's the difference
  // between "instant" and "30 seconds with the overlay stuck".
  type DestRow = {
    id: string;
    quantity_normal: number;
    quantity_foil: number;
    quantity_etched: number;
  };
  const destRows = await db.getAll<DestRow & {
    card_id: string;
    condition: string;
    language: string;
  }>(
    `SELECT id, card_id, condition, language,
            quantity_normal, quantity_foil, quantity_etched
       FROM collection_cards WHERE collection_id = ?`,
    [destinationId]
  );
  const destMap = new Map<string, DestRow>();
  for (const r of destRows) {
    destMap.set(`${r.card_id}|${r.condition}|${r.language}`, {
      id: r.id,
      quantity_normal: r.quantity_normal ?? 0,
      quantity_foil: r.quantity_foil ?? 0,
      quantity_etched: r.quantity_etched ?? 0,
    });
  }

  // Single strategy for both "new in dest" and "conflict with existing":
  // write a fresh row with merged quantities, then DELETE the existing
  // conflict row (if any). This avoids PATCH (UPDATE) ops entirely — all
  // writes are PUT + DELETE, which the batching connector handles
  // efficiently and which upserts can't break via the RLS-on-PATCH edge
  // case (see SupabaseConnector docstring).
  const inserts: Array<{
    id: string;
    card_id: string;
    condition: string;
    language: string;
    quantity_normal: number;
    quantity_foil: number;
    quantity_etched: number;
    purchase_price: number | null;
  }> = [];
  const staleDestIds: string[] = [];

  for (const src of sourceChildren) {
    const key = `${src.card_id}|${src.condition}|${src.language}`;
    const hit = destMap.get(key);
    if (hit) {
      // Same print/condition/lang already in dest — replace it with a
      // fresh row that has the summed quantities. DELETE the old row
      // so we don't carry both.
      staleDestIds.push(hit.id);
      const merged = {
        id: newId(),
        card_id: src.card_id,
        condition: src.condition,
        language: src.language,
        quantity_normal: hit.quantity_normal + (src.quantity_normal ?? 0),
        quantity_foil: hit.quantity_foil + (src.quantity_foil ?? 0),
        quantity_etched: hit.quantity_etched + (src.quantity_etched ?? 0),
        purchase_price: src.purchase_price,
      };
      destMap.set(key, {
        id: merged.id,
        quantity_normal: merged.quantity_normal,
        quantity_foil: merged.quantity_foil,
        quantity_etched: merged.quantity_etched,
      });
      inserts.push(merged);
    } else {
      const row = {
        id: newId(),
        card_id: src.card_id,
        condition: src.condition,
        language: src.language,
        quantity_normal: src.quantity_normal ?? 0,
        quantity_foil: src.quantity_foil ?? 0,
        quantity_etched: src.quantity_etched ?? 0,
        purchase_price: src.purchase_price,
      };
      destMap.set(key, {
        id: row.id,
        quantity_normal: row.quantity_normal,
        quantity_foil: row.quantity_foil,
        quantity_etched: row.quantity_etched,
      });
      inserts.push(row);
    }
  }

  const BATCH = 80;

  await db.writeTransaction(async (tx) => {
    // Order matters: DELETEs of stale dest rows MUST go before INSERTs
    // of the merged replacements. The unique constraint
    // (collection_id, card_id, condition, language) rejects an INSERT
    // while the old row for that tuple is still server-side. Since
    // PowerSync uploads ops in the order they were written, we have to
    // enqueue the DELETEs first.
    const DEL_BATCH = 500;
    for (let i = 0; i < staleDestIds.length; i += DEL_BATCH) {
      const slice = staleDestIds.slice(i, i + DEL_BATCH);
      const placeholders = slice.map(() => '?').join(', ');
      await tx.execute(
        `DELETE FROM collection_cards WHERE id IN (${placeholders})`,
        slice
      );
    }

    // Now batch INSERTs into dest.
    for (let i = 0; i < inserts.length; i += BATCH) {
      const slice = inserts.slice(i, i + BATCH);
      const placeholders = slice.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const params: any[] = [];
      for (const r of slice) {
        params.push(
          r.id,
          userId,
          destinationId,
          r.card_id,
          r.condition,
          r.language,
          r.quantity_normal,
          r.quantity_foil,
          r.quantity_etched,
          r.purchase_price,
          now,
          now
        );
      }
      await tx.execute(
        `INSERT INTO collection_cards
           (id, user_id, collection_id, card_id, condition, language,
            quantity_normal, quantity_foil, quantity_etched,
            purchase_price, added_at, updated_at)
         VALUES ${placeholders}`,
        params
      );
    }

    // Wipe the source. Same ps_crud purge pattern as delete/empty to
    // avoid zombies: a duplicate-in-flight for the source collection
    // would fail RLS after we DELETE the parent.
    await tx.execute(
      `DELETE FROM ps_crud
        WHERE json_extract(data, '$.type') = 'collection_cards'
          AND json_extract(data, '$.data.collection_id') = ?`,
      [sourceId]
    );
    await tx.execute(
      `DELETE FROM ps_crud
        WHERE json_extract(data, '$.type') = 'collections'
          AND json_extract(data, '$.id') = ?
          AND json_extract(data, '$.op') = 'PUT'`,
      [sourceId]
    );
    await tx.execute(`DELETE FROM collection_cards WHERE collection_id = ?`, [sourceId]);
    await tx.execute(`DELETE FROM collections WHERE id = ?`, [sourceId]);
  });

  return sourceChildren.length;
}

/**
 * Wipe every `collection_cards` row for a collection while keeping the
 * parent row (name, color, folder, type, description). Local-first:
 *
 *   1. Count the rows locally so the caller gets a confirmation number.
 *   2. DELETE all children in SQLite in a single statement. Every row
 *      gets enqueued in the PowerSync CRUD queue so offline users see
 *      the empty state instantly; uploads drain when the radio returns.
 *   3. Fire-and-forget `sp_empty_collection` so an online device lets
 *      the server do the cascade in one shot. Queued local DELETEs
 *      will be idempotent no-ops when they finally land.
 */
export async function emptyCollectionLocal(collectionId: string): Promise<number> {
  const countRows = await db.getAll<{ c: number }>(
    `SELECT COUNT(*) AS c FROM collection_cards WHERE collection_id = ?`,
    [collectionId]
  );
  const count = Number(countRows?.[0]?.c ?? 0);

  // Cancel any pending PUTs/UPDATES for cards belonging to this
  // collection BEFORE issuing the local DELETE. Prevents a queued
  // duplicate-in-flight from fighting the server-side `sp_empty_collection`
  // RPC below (the RPC wipes the rows; the queued PUTs would then fail
  // with 42501 because their would-be parent context is gone).
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `DELETE FROM ps_crud
        WHERE json_extract(data, '$.type') = 'collection_cards'
          AND json_extract(data, '$.data.collection_id') = ?`,
      [collectionId]
    );
    await tx.execute(
      `DELETE FROM collection_cards WHERE collection_id = ?`,
      [collectionId]
    );
  });

  supabase.rpc('sp_empty_collection', { p_collection_id: collectionId })
    .then(({ error }) => {
      if (error) console.warn('[emptyCollectionLocal] background RPC failed', error.message);
    });

  return count;
}

// ─────────────────────────────────────────────────────────────────────────
// Card mutations — local-first alternatives to src/lib/collection.ts
// addToCollection / adjustOwnershipQuantity. These write straight to the
// PowerSync SQLite so the UI updates on the next render (useQuery is
// reactive). The CRUD queue uploads to Supabase in the background.
// ─────────────────────────────────────────────────────────────────────────

export type AddCardParams = {
  card: ScryfallCard;
  collectionId: string;
  condition: Condition;
  finish: Finish;
  quantity: number;
  language?: string;
  purchasePrice?: number | null;
};

/**
 * Add a card to a collection without blocking on the network.
 *
 * Flow:
 *   1. Resolve card_id from catalog.db — 99% of cards land here with zero
 *      network round-trips.
 *   2. Only if the card isn't in the local snapshot (new spoiler), fall
 *      through to ensureCardExists (Supabase + ensure-card Edge Function).
 *   3. Run SELECT + UPDATE-or-INSERT inside a write transaction so double-
 *      taps don't race each other into two rows for the same variant.
 */
export async function addCardToCollectionLocal(params: AddCardParams): Promise<void> {
  const {
    card,
    collectionId,
    condition,
    finish,
    quantity,
    purchasePrice = null,
  } = params;

  if (quantity <= 0) return;

  // ensureCardExists hits catalog.db first; only falls back to network when
  // the card is truly new. This is the one potentially-networked step in
  // the whole flow — everything else is local SQLite.
  const cardId = await ensureCardExists(card);

  // Language resolution — in order of trust:
  //   1. params.language — explicit from the caller.
  //   2. card.lang — Scryfall language of the print itself (a JP Mox
  //      Opal has a distinct scryfall_id AND lang='ja').
  //   3. Existing copy of THIS print in any of the user's collections —
  //      covers retired prints whose catalog row lost `lang` (e.g. old
  //      Secret Lair drops Scryfall dropped from the bulk feed). If the
  //      user already knows the language by having another copy, reuse
  //      it instead of flattening everything to 'en'.
  //   4. 'en' — last-resort default.
  let language = params.language ?? card.lang;
  if (!language) {
    const priorRow = await db.getAll<{ language: string | null }>(
      `SELECT language FROM collection_cards WHERE card_id = ? AND language IS NOT NULL LIMIT 1`,
      [cardId]
    );
    language = priorRow?.[0]?.language ?? 'en';
  }

  const userId = await getUserId();
  const now = new Date().toISOString();

  await db.writeTransaction(async (tx) => {
    const existing = await tx.getAll<{
      id: string;
      quantity_normal: number;
      quantity_foil: number;
      quantity_etched: number;
      purchase_price: number | null;
    }>(
      `SELECT id, quantity_normal, quantity_foil, quantity_etched, purchase_price
         FROM collection_cards
        WHERE collection_id = ? AND card_id = ? AND condition = ? AND language = ?
        LIMIT 1`,
      [collectionId, cardId, condition, language]
    );

    if (existing.length > 0) {
      const row = existing[0];
      const nextNormal = (row.quantity_normal ?? 0) + (finish === 'normal' ? quantity : 0);
      const nextFoil = (row.quantity_foil ?? 0) + (finish === 'foil' ? quantity : 0);
      const nextEtched = (row.quantity_etched ?? 0) + (finish === 'etched' ? quantity : 0);
      const nextPrice = purchasePrice != null ? purchasePrice : row.purchase_price;
      await tx.execute(
        `UPDATE collection_cards
            SET quantity_normal = ?, quantity_foil = ?, quantity_etched = ?,
                purchase_price = ?, updated_at = ?
          WHERE id = ?`,
        [nextNormal, nextFoil, nextEtched, nextPrice, now, row.id]
      );
    } else {
      await tx.execute(
        `INSERT INTO collection_cards
           (id, user_id, collection_id, card_id, condition, language,
            quantity_normal, quantity_foil, quantity_etched,
            purchase_price, added_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          userId,
          collectionId,
          cardId,
          condition,
          language,
          finish === 'normal' ? quantity : 0,
          finish === 'foil' ? quantity : 0,
          finish === 'etched' ? quantity : 0,
          purchasePrice,
          now,
          now,
        ]
      );
    }
  });
}

/**
 * Bump one finish on an existing collection_cards row by a signed delta.
 * When all three finishes reach zero the row is deleted — matches the
 * server constraint `qty_normal + qty_foil + qty_etched > 0`.
 */
export async function adjustOwnershipQuantityLocal(
  entryId: string,
  finish: Finish,
  delta: number
): Promise<void> {
  const now = new Date().toISOString();

  await db.writeTransaction(async (tx) => {
    const rows = await tx.getAll<{
      quantity_normal: number;
      quantity_foil: number;
      quantity_etched: number;
    }>(
      `SELECT quantity_normal, quantity_foil, quantity_etched
         FROM collection_cards
        WHERE id = ?
        LIMIT 1`,
      [entryId]
    );
    if (rows.length === 0) return;

    const row = rows[0];
    const col =
      finish === 'normal' ? 'quantity_normal'
      : finish === 'foil' ? 'quantity_foil'
      : 'quantity_etched';
    const current = row[col] ?? 0;
    const next = Math.max(0, current + delta);

    const projected = {
      quantity_normal: row.quantity_normal ?? 0,
      quantity_foil: row.quantity_foil ?? 0,
      quantity_etched: row.quantity_etched ?? 0,
      [col]: next,
    };
    const total =
      projected.quantity_normal + projected.quantity_foil + projected.quantity_etched;

    if (total <= 0) {
      await tx.execute(`DELETE FROM collection_cards WHERE id = ?`, [entryId]);
      return;
    }

    await tx.execute(
      `UPDATE collection_cards
          SET ${col} = ?, updated_at = ?
        WHERE id = ?`,
      [next, now, entryId]
    );
  });
}
