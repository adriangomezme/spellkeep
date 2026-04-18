import { InteractionManager } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import pako from 'pako';
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
 * Downloads the pre-compiled SQLite snapshot, ungzips it, and atomically
 * replaces the local catalog.db file.
 */
async function installSnapshot(index: CatalogIndex): Promise<void> {
  const gzPath = `${FileSystem.cacheDirectory}catalog-download.sqlite.gz`;
  const finalPath = `${FileSystem.documentDirectory}${CATALOG_DB_FILENAME}`;

  // 1. Download .sqlite.gz with live progress.
  publish({ status: 'downloading', progress: 0 });

  await FileSystem.deleteAsync(gzPath, { idempotent: true });
  const downloader = FileSystem.createDownloadResumable(
    index.snapshot_url!,
    gzPath,
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

  // 2. Decompress. This is the one unavoidable blocking step — pako is
  // pure JS and we need the whole 20–40 MB gzip buffer in memory at
  // once. Yielding right before it keeps the UI painted through the
  // download phase; the actual inflate is ~2–4 s on a mid-range device.
  publish({ status: 'applying', progress: 0 });
  await yieldToUi();

  const gzBase64 = await FileSystem.readAsStringAsync(gzPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const gzBytes = base64ToBytes(gzBase64);

  publish({ status: 'applying', progress: 0.2 });
  await yieldToUi();

  const sqliteBytes = pako.ungzip(gzBytes);

  publish({ status: 'applying', progress: 0.5 });
  await yieldToUi();

  // 3. Close any existing catalog handle, remove old files, then write the
  // new SQLite + leave no WAL/journal behind to confuse the engine.
  closeCatalog();
  await FileSystem.deleteAsync(finalPath, { idempotent: true });
  await FileSystem.deleteAsync(`${finalPath}-wal`, { idempotent: true });
  await FileSystem.deleteAsync(`${finalPath}-shm`, { idempotent: true });
  await FileSystem.deleteAsync(`${finalPath}-journal`, { idempotent: true });

  const sqliteBase64 = bytesToBase64(sqliteBytes);
  publish({ status: 'applying', progress: 0.8 });
  await yieldToUi();

  await FileSystem.writeAsStringAsync(finalPath, sqliteBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // 4. Clean up the download tmp file.
  await FileSystem.deleteAsync(gzPath, { idempotent: true });
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function base64ToBytes(base64: string): Uint8Array {
  const bin = globalThis.atob(base64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunk the conversion to avoid passing a gigantic argument list to
  // String.fromCharCode, which throws on large inputs in some engines.
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    bin += String.fromCharCode.apply(null, Array.from(slice) as any);
  }
  return globalThis.btoa(bin);
}
