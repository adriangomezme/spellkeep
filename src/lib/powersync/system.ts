import { PowerSyncDatabase } from '@powersync/react-native';
import { AppSchema } from './schema';
import { SupabaseConnector } from './SupabaseConnector';
import { wipeLocalUserData } from './wipeLocal';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'spellkeep.db',
  },
});

export const connector = new SupabaseConnector();

// Sync streams we keep permanently active for every signed-in user.
// Edition-3 streams are opt-in — without an explicit subscription the
// server treats our account as "no data", which causes PowerSync to drop
// locally-inserted rows during its next reconciliation pass.
const DEFAULT_STREAMS: string[] = [
  'global_sets',
  'global_top_commanders',
  'global_meta_decks',
  'user_profile',
  'user_collection_folders',
  'user_collections',
  'user_tags',
  'user_decks',
  'user_scans',
  'user_price_alerts',
  'user_price_alert_events',
];

const STREAM_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

async function connectAndSubscribe() {
  // Drop the CRUD upload throttle from the 1 s default to 100 ms so user-
  // created folders / binders reach Supabase almost immediately after the
  // local insert. Batching still kicks in when many rows are queued.
  await db.connect(connector, { crudUploadThrottleMs: 100 });
  for (const name of DEFAULT_STREAMS) {
    try {
      await db.syncStream(name).subscribe({ ttl: STREAM_TTL_SECONDS });
    } catch (err) {
      console.warn(`[powersync] subscribe ${name} failed`, err);
    }
  }
}

export async function setupPowerSync() {
  await db.init();
  await connectAndSubscribe();
}

/**
 * Called by the auth layer when the signed-in user changes (logout+
 * login, anon → real account, account A → account B). Disconnects the
 * active sync, wipes every user-scoped local table, then reconnects
 * against the new user's token. The catalog tables are global and
 * intentionally survive.
 *
 * Note: we do NOT use `disconnectAndClear` here because it mutates
 * PowerSync's internal oplog/bucket state in a way that, in our app,
 * prevented the next `connect()` from draining the downloaded sync
 * into user tables — leaving the account empty even after minutes.
 * Manual DELETE + disconnect/connect keeps the sync engine intact.
 */
export async function resetForUserChange(): Promise<void> {
  try {
    await db.disconnect();
  } catch (err) {
    console.warn('[powersync] disconnect failed', err);
  }
  await wipeLocalUserData();
  await connectAndSubscribe();
}

/**
 * Count how many mutations PowerSync still has queued for upload. These
 * are stored in the internal `ps_crud` table and drained by the connector
 * one-by-one — a stale 100k-row DELETE cascade from before migration
 * 00027 parks there indefinitely if we don't clear it.
 */
export async function getPendingUploadCount(): Promise<number> {
  try {
    const rows = await db.getAll<{ c: number }>(`SELECT COUNT(*) as c FROM ps_crud`);
    return Number(rows?.[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Drop every pending upload op without executing it. Use when the queue
 * contains mutations the user no longer wants (e.g. the pre-RPC bulk
 * DELETE fan-out). Server is the source of truth; sync streams reconcile
 * local state afterward.
 */
export async function clearPendingUploads(): Promise<number> {
  const before = await getPendingUploadCount();
  try {
    await db.execute(`DELETE FROM ps_crud`);
  } catch (err) {
    console.warn('[powersync] clearPendingUploads failed', err);
  }
  return before;
}
