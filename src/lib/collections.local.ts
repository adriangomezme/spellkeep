import { db } from './powersync/system';
import { supabase } from './supabase';
import type { CollectionType } from './collections';

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
