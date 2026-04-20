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

export async function deleteCollectionLocal(id: string): Promise<void> {
  // Optimistic UI: drop the local parent row immediately so the hub
  // hides the entry on the next useQuery tick (no modal, no waiting).
  // PowerSync enqueues this single DELETE in the CRUD queue and uploads
  // it in the background. The collection_cards children stay in local
  // SQLite temporarily but the hub doesn't reference them — it only
  // reads `collections` — so the user sees "gone" instantly.
  await db.execute(`DELETE FROM collections WHERE id = ?`, [id]);

  // Also fire the server-side bulk RPC in the background. This is NOT
  // required for correctness — the server's FK cascade will handle the
  // child rows when the CRUD DELETE upload lands — but running the RPC
  // triggers the cascade immediately without waiting for PowerSync's
  // upload throttle, so the child collection_cards disappear from other
  // devices (and the local stream clean-up) sooner.
  supabase.rpc('sp_delete_collection', { p_collection_id: id })
    .then(({ error }) => {
      if (error) console.warn('[deleteCollectionLocal] background RPC failed', error.message);
    });
}

export async function deleteFolderLocal(id: string): Promise<void> {
  await db.execute(`DELETE FROM collection_folders WHERE id = ?`, [id]);
}

export async function deleteFolderWithContentsLocal(id: string): Promise<void> {
  // Optimistic: delete the folder row AND its child collections from
  // local SQLite so the hub hides them on the next render. Each child
  // DELETE uploads via CRUD queue; the server's FK cascade wipes the
  // child collection_cards in one shot. The heavy lifting still happens
  // server-side (the background RPC below forces the cascade early).
  await db.writeTransaction(async (tx) => {
    const children = await tx.getAll<{ id: string }>(
      `SELECT id FROM collections WHERE folder_id = ?`,
      [id]
    );
    for (const child of children) {
      await tx.execute(`DELETE FROM collections WHERE id = ?`, [child.id]);
    }
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

  // Prefer an explicit language on the call, else the card's own
  // language (Scryfall exposes this per print — a JP Mox Opal has a
  // distinct scryfall_id AND `lang='ja'`). Last-resort default is 'en'
  // so pre-backfill catalog rows without `lang` still insert cleanly.
  const language = params.language ?? card.lang ?? 'en';

  // ensureCardExists hits catalog.db first; only falls back to network when
  // the card is truly new. This is the one potentially-networked step in
  // the whole flow — everything else is local SQLite.
  const cardId = await ensureCardExists(card);
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
