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

// Lazy in-memory cache of set code → icon_svg_uri. Populated the first
// time something actually asks for a set icon; never eagerly at boot.
// Kept for the lifetime of the catalog connection so subsequent reads
// are instant.
const setIconMap = new Map<string, string>();
let setIconLoaded = false;
let setIconLoading: Promise<void> | null = null;

/**
 * Synchronous getter. Returns the cached URI if the lazy map has been
 * filled, otherwise null. Pair with ensureSetIconsLoaded() to prime it.
 */
export function getSetIconSync(setCode: string): string | null {
  return setIconMap.get(setCode.toLowerCase()) ?? null;
}

/**
 * Loads the full code → icon_svg_uri map from the catalog once per
 * session. Single query (~1031 rows, ~200 KB in memory) that runs only
 * on the first icon miss. Idempotent: concurrent callers share the same
 * in-flight promise.
 */
export function ensureSetIconsLoaded(): Promise<void> {
  if (setIconLoaded) return Promise.resolve();
  if (setIconLoading) return setIconLoading;
  setIconLoading = loadSetIconMap()
    .then(() => {
      setIconLoaded = true;
    })
    .finally(() => {
      setIconLoading = null;
    });
  return setIconLoading;
}

async function loadSetIconMap(): Promise<void> {
  if (!connection) return;
  const res = await connection.execute('SELECT code, icon_svg_uri FROM sets');
  const arr = (res as any)?.rows?._array ?? [];
  setIconMap.clear();
  for (const row of arr) {
    if (row?.code && row?.icon_svg_uri) {
      setIconMap.set((row.code as string).toLowerCase(), row.icon_svg_uri as string);
    }
  }
}

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
  setIconMap.clear();
  setIconLoaded = false;
}

export function getCatalog(): QuickSQLiteConnection | null {
  return connection;
}

export const CATALOG_DB_FILENAME = CATALOG_DB_NAME;
