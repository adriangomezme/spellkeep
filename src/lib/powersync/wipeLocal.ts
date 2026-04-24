import { db } from './system';

// User-scoped tables — synced and local-only. Wiped during auth
// transitions so the next user never sees residue from the previous.
// Catalog tables (`sets`, `cards`, `catalog_meta`) are global and
// intentionally preserved — re-downloading the catalog is expensive.
const USER_SCOPED_TABLES = [
  // Synced, user-scoped
  'profiles',
  'collection_folders',
  'collections',
  'collection_cards',
  'deck_folders',
  'decks',
  'deck_cards',
  'scan_history',
  'price_alerts',
  'price_alert_events',
  // Local-only, user-scoped
  'price_overrides',
  'collection_stats_cache',
] as const;

/**
 * Drop every row in user-scoped tables and clear pending CRUD ops.
 * `ps_crud` rows belong to the previous user — destined for an
 * account we're no longer authenticated as.
 */
export async function wipeLocalUserData(): Promise<void> {
  for (const table of USER_SCOPED_TABLES) {
    try {
      await db.execute(`DELETE FROM ${table}`);
    } catch (err) {
      console.warn(`[wipeLocalUserData] DELETE FROM ${table} failed`, err);
    }
  }
  try {
    await db.execute(`DELETE FROM ps_crud`);
  } catch (err) {
    console.warn('[wipeLocalUserData] DELETE FROM ps_crud failed', err);
  }
}
