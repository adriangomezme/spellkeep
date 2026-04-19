import { InteractionManager } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getMeta, setMeta } from './catalogMeta';
import { CATALOG_DB_FILENAME, closeCatalog, openCatalog } from './catalogDb';
import type { CatalogIndex, CatalogSyncState } from './types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const INDEX_URL = `${SUPABASE_URL}/storage/v1/object/public/catalog-deltas/index.json`;

const META_KEYS = {
  snapshotVersion: 'snapshot_version',
  lastSyncAt: 'last_sync_at',
} as const;

type Listener = (state: CatalogSyncState) => void;

let state: CatalogSyncState = { status: 'idle' };
const listeners = new Set<Listener>();

function publish(next: Partial<CatalogSyncState>) {
  state = { ...state, ...next };
  for (const l of listeners) l(state);
}

export function getCatalogSyncState(): CatalogSyncState {
  return state;
}

export function subscribeCatalogSync(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

/**
 * Call once at app startup. Defers the actual sync until after the initial
 * render pass so the first interaction is never stalled.
 */
let inFlight: Promise<void> | null = null;
export function ensureCatalogFresh(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      runSync()
        .catch((err) => console.error('[catalog-sync]', err))
        .finally(() => resolve());
    });
  }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<void> {
  publish({ status: 'checking', progress: undefined, error: undefined });

  const remoteIndex = await fetchIndex();
  if (!remoteIndex?.snapshot_version || !remoteIndex.snapshot_url) {
    publish({ status: 'error', error: 'No catalog snapshot available' });
    return;
  }

  const localVersion = await getMeta(META_KEYS.snapshotVersion);
  const localFilePath = `${FileSystem.documentDirectory}${CATALOG_DB_FILENAME}`;
  const localFileExists = (await FileSystem.getInfoAsync(localFilePath)).exists;

  // Up to date — just make sure the DB is open and bail.
  if (localVersion === remoteIndex.snapshot_version && localFileExists) {
    openCatalog();
    publish({
      status: 'ready',
      progress: 1,
      snapshotVersion: localVersion,
      lastSyncAt: (await getMeta(META_KEYS.lastSyncAt)) ?? undefined,
    });
    return;
  }

  await installSnapshot(remoteIndex);

  const now = new Date().toISOString();
  await setMeta(META_KEYS.snapshotVersion, remoteIndex.snapshot_version);
  await setMeta(META_KEYS.lastSyncAt, now);

  openCatalog();

  publish({
    status: 'ready',
    progress: 1,
    snapshotVersion: remoteIndex.snapshot_version,
    lastSyncAt: now,
  });
}

async function fetchIndex(): Promise<CatalogIndex | null> {
  try {
    const res = await fetch(INDEX_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as CatalogIndex;
  } catch (err) {
    console.error('[catalog-sync] index fetch failed:', err);
    return null;
  }
}

/**
 * Streams the pre-compiled SQLite snapshot straight to the local catalog
 * path on disk. No decompression, no base64 conversion, no JS-thread work
 * — expo-file-system writes bytes natively and our role is limited to
 * publishing progress updates.
 */
async function installSnapshot(index: CatalogIndex): Promise<void> {
  const finalPath = `${FileSystem.documentDirectory}${CATALOG_DB_FILENAME}`;
  const tmpPath = `${FileSystem.cacheDirectory}catalog-download.sqlite`;

  // Close any existing connection so we can swap the file safely.
  closeCatalog();

  publish({ status: 'downloading', progress: 0 });

  await FileSystem.deleteAsync(tmpPath, { idempotent: true });
  const downloader = FileSystem.createDownloadResumable(
    index.snapshot_url!,
    tmpPath,
    {},
    (p) => {
      if (p.totalBytesExpectedToWrite > 0) {
        publish({
          status: 'downloading',
          progress: p.totalBytesWritten / p.totalBytesExpectedToWrite,
        });
      }
    }
  );
  const dl = await downloader.downloadAsync();
  if (!dl) throw new Error('Snapshot download returned no result');

  publish({ status: 'applying', progress: 0.5 });

  // Clean out any stale file on the final path before moving the new one in.
  await FileSystem.deleteAsync(finalPath, { idempotent: true });
  await FileSystem.deleteAsync(`${finalPath}-wal`, { idempotent: true });
  await FileSystem.deleteAsync(`${finalPath}-shm`, { idempotent: true });
  await FileSystem.deleteAsync(`${finalPath}-journal`, { idempotent: true });

  await FileSystem.moveAsync({ from: tmpPath, to: finalPath });

  publish({ status: 'applying', progress: 1 });
}
