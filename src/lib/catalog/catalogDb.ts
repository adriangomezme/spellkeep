import { open, type QuickSQLiteConnection } from '@journeyapps/react-native-quick-sqlite';

/**
 * A standalone read-only SQLite connection to the pre-compiled catalog
 * shipped by the server.
 *
 * We keep this connection completely independent from PowerSync's
 * managed database so (a) writes to PowerSync's upload queue never
 * contend with catalog reads, and (b) swapping the catalog file on disk
 * (new snapshot download) is a local concern — close, replace, reopen.
 *
 * The file lives at `<Documents>/catalog.db`. react-native-quick-sqlite
 * resolves `open(name)` relative to the Documents directory by default
 * on both iOS and Android, which matches where we write the extracted
 * SQLite from catalogSync.
 */

const CATALOG_DB_NAME = 'catalog.db';

let connection: QuickSQLiteConnection | null = null;

export function openCatalog(): QuickSQLiteConnection {
  if (connection) return connection;
  connection = open(CATALOG_DB_NAME);

  // Hint the planner + engine now that the file is attached. These are
  // per-connection settings so they apply to this single catalog handle.
  // The SQLite file itself was ANALYZE'd + VACUUM'd by the build worker.
  connection.execute('PRAGMA query_only = ON;');
  connection.execute('PRAGMA cache_size = -64000;'); // ~64 MB page cache

  return connection;
}

export function closeCatalog(): void {
  if (!connection) return;
  try {
    connection.close();
  } catch {
    // Already closed or never opened cleanly.
  }
  connection = null;
}

export function getCatalog(): QuickSQLiteConnection | null {
  return connection;
}

export const CATALOG_DB_FILENAME = CATALOG_DB_NAME;
