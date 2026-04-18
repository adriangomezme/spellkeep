import * as FileSystem from 'expo-file-system/legacy';
import pako from 'pako';
import { db } from '../powersync/system';
import { getMeta, setMeta } from './catalogMeta';
import type {
  CatalogCardPayload,
  CatalogDelta,
  CatalogIndex,
  CatalogSyncState,
} from './types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const DELTAS_PUBLIC = `${SUPABASE_URL}/storage/v1/object/public/catalog-deltas`;
const INDEX_URL = `${DELTAS_PUBLIC}/index.json`;

const META_KEYS = {
  snapshotVersion: 'snapshot_version',
  lastDelta: 'last_delta_version',
  lastSyncAt: 'last_sync_at',
} as const;

// If local is more than this many days behind, skip the delta chain and
// re-download the latest snapshot instead.
const SNAPSHOT_REDOWNLOAD_DAYS = 60;

// Rows per INSERT transaction when applying a snapshot. Smaller chunks let
// the JS thread yield back to the UI between transactions so the progress
// bar animates and the user can still scroll / tap.
const APPLY_CHUNK = 200;

// How many cards to insert before yielding to the event loop. Keeping this
// small (a couple of chunks) means the badge re-renders smoothly.
const YIELD_EVERY_CHUNKS = 2;

type Listener = (state: CatalogSyncState) => void;

let state: CatalogSyncState = { status: 'idle' };
const listeners = new Set<Listener>();

function publish(next: Partial<CatalogSyncState>) {
  state = { ...state, ...next };
  for (const l of listeners) l(state);
}

// Give React a tick to re-render the badge before we grab the JS thread again.
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function getCatalogSyncState(): CatalogSyncState {
  return state;
}

export function subscribeCatalogSync(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

let inFlight: Promise<void> | null = null;
export function ensureCatalogFresh(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<void> {
  try {
    publish({ status: 'checking', progress: undefined, error: undefined });

    const remoteIndex = await fetchIndex();
    if (!remoteIndex?.snapshot_version || !remoteIndex.snapshot_url) {
      publish({ status: 'error', error: 'No catalog snapshot available' });
      return;
    }

    const localSnapshot = await getMeta(META_KEYS.snapshotVersion);
    const localDelta = await getMeta(META_KEYS.lastDelta);

    if (!localSnapshot) {
      await applySnapshotFromUrl(remoteIndex.snapshot_url, remoteIndex.snapshot_version);
      if (remoteIndex.latest_delta) {
        await setMeta(META_KEYS.lastDelta, remoteIndex.latest_delta);
      }
      await finalize(remoteIndex.snapshot_version);
      return;
    }

    if (localSnapshot !== remoteIndex.snapshot_version) {
      const daysBehind = daysBetween(localSnapshot, remoteIndex.snapshot_version);
      if (daysBehind >= SNAPSHOT_REDOWNLOAD_DAYS) {
        await applySnapshotFromUrl(remoteIndex.snapshot_url, remoteIndex.snapshot_version);
        if (remoteIndex.latest_delta) {
          await setMeta(META_KEYS.lastDelta, remoteIndex.latest_delta);
        }
        await finalize(remoteIndex.snapshot_version);
        return;
      }
    }

    if (remoteIndex.latest_delta && remoteIndex.latest_delta !== localDelta) {
      await applyDeltasSince(localDelta ?? localSnapshot, remoteIndex.latest_delta);
      await setMeta(META_KEYS.lastDelta, remoteIndex.latest_delta);
    }

    await finalize(localSnapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[catalog-sync] failed:', msg);
    publish({ status: 'error', error: msg });
  }
}

async function finalize(snapshotVersion: string): Promise<void> {
  const now = new Date().toISOString();
  await setMeta(META_KEYS.lastSyncAt, now);
  publish({ status: 'ready', progress: 1, snapshotVersion, lastSyncAt: now });
}

async function fetchIndex(): Promise<CatalogIndex | null> {
  const res = await fetch(INDEX_URL, { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json()) as CatalogIndex;
}

// ── Snapshot (bulk JSON.gz bootstrap) ─────────────────────────────────────

type SnapshotPayload = {
  version: string;
  generated_at: string;
  cards: CatalogCardPayload[];
  sets: CatalogSetPayload[];
};

type CatalogSetPayload = {
  code: string;
  name: string;
  set_type: string | null;
  released_at: string | null;
  card_count: number | null;
  icon_svg_uri: string | null;
};

async function applySnapshotFromUrl(url: string, version: string): Promise<void> {
  publish({ status: 'downloading', progress: 0 });

  // Download to disk so (a) we get progress, (b) we don't hold the gzipped
  // payload in JS heap alongside the decompressed JSON string later.
  const tmpPath = `${FileSystem.cacheDirectory}catalog-${version}.json.gz`;
  try {
    const downloader = FileSystem.createDownloadResumable(url, tmpPath, {}, (p) => {
      if (p.totalBytesExpectedToWrite > 0) {
        publish({
          status: 'downloading',
          progress: p.totalBytesWrittenSoFar / p.totalBytesExpectedToWrite,
        });
      }
    });
    const result = await downloader.downloadAsync();
    if (!result) throw new Error('Snapshot download returned no result');

    publish({ status: 'applying', progress: 0 });
    await yieldToUi();

    const payload = await readAndUngzipJson<SnapshotPayload>(result.uri);
    await applySnapshotPayload(payload);

    await setMeta(META_KEYS.snapshotVersion, version);
  } finally {
    await FileSystem.deleteAsync(tmpPath, { idempotent: true });
  }
}

async function readAndUngzipJson<T>(uri: string): Promise<T> {
  // Read gzip bytes as base64 (expo-file-system doesn't expose binary reads).
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);
  const json = pako.ungzip(bytes, { to: 'string' });
  return JSON.parse(json) as T;
}

function base64ToBytes(base64: string): Uint8Array {
  // RN's atob is available in the Hermes runtime.
  const bin = globalThis.atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function applySnapshotPayload(payload: SnapshotPayload): Promise<void> {
  const cards = payload.cards;
  const sets = payload.sets;
  const totalUnits = cards.length + sets.length;
  let done = 0;

  let chunkIdx = 0;
  for (let i = 0; i < cards.length; i += APPLY_CHUNK) {
    const chunk = cards.slice(i, i + APPLY_CHUNK);
    await applyCardsChunk(chunk);
    done += chunk.length;
    publish({ status: 'applying', progress: done / totalUnits });
    if (++chunkIdx % YIELD_EVERY_CHUNKS === 0) await yieldToUi();
  }

  if (sets.length > 0) {
    await applySetsChunk(sets);
    done += sets.length;
    publish({ status: 'applying', progress: done / totalUnits });
  }
}

// ── Deltas (incremental JSON.gz) ──────────────────────────────────────────

async function applyDeltasSince(fromVersion: string, toVersion: string): Promise<void> {
  const dates = enumerateDates(fromVersion, toVersion);
  if (dates.length === 0) return;

  publish({ status: 'downloading', progress: 0 });

  for (let i = 0; i < dates.length; i++) {
    const url = `${DELTAS_PUBLIC}/${dates[i]}.json.gz`;
    const delta = await fetchDelta(url);
    if (delta?.changed_cards?.length) {
      publish({ status: 'applying', progress: (i + 0.5) / dates.length });
      for (let j = 0; j < delta.changed_cards.length; j += APPLY_CHUNK) {
        await applyCardsChunk(delta.changed_cards.slice(j, j + APPLY_CHUNK));
      }
      await yieldToUi();
    }
    publish({ progress: (i + 1) / dates.length });
  }
}

async function fetchDelta(url: string): Promise<CatalogDelta | null> {
  // Deltas are small enough (~1-5 MB) to fetch directly without the
  // download-to-disk dance we do for snapshots.
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`delta fetch ${url} failed: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const json = pako.ungzip(buf, { to: 'string' });
  return JSON.parse(json) as CatalogDelta;
}

// ── Shared write helpers ──────────────────────────────────────────────────

async function applyCardsChunk(cards: CatalogCardPayload[]): Promise<void> {
  if (cards.length === 0) return;
  await db.writeTransaction(async (tx) => {
    for (const card of cards) {
      await tx.execute(
        `INSERT OR REPLACE INTO catalog_cards (
          id, scryfall_id, oracle_id, name, mana_cost, cmc, type_line,
          colors, color_identity, rarity, set_code, set_name, collector_number,
          image_uri_small, image_uri_normal, price_usd, price_usd_foil,
          price_eur, price_eur_foil, legalities, released_at, is_legendary,
          layout, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        serializeCard(card)
      );
    }
  });
}

async function applySetsChunk(sets: CatalogSetPayload[]): Promise<void> {
  await db.writeTransaction(async (tx) => {
    for (const s of sets) {
      await tx.execute(
        `INSERT OR REPLACE INTO catalog_sets (
          id, code, name, set_type, released_at, card_count, icon_svg_uri
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [s.code, s.code, s.name, s.set_type, s.released_at, s.card_count, s.icon_svg_uri]
      );
    }
  });
}

function serializeCard(card: CatalogCardPayload): (string | number | null)[] {
  return [
    card.id,
    card.scryfall_id,
    card.oracle_id,
    card.name,
    card.mana_cost,
    card.cmc,
    card.type_line,
    card.colors ? JSON.stringify(card.colors) : null,
    card.color_identity ? JSON.stringify(card.color_identity) : null,
    card.rarity,
    card.set_code,
    card.set_name,
    card.collector_number,
    card.image_uri_small,
    card.image_uri_normal,
    card.price_usd,
    card.price_usd_foil,
    card.price_eur,
    card.price_eur_foil,
    card.legalities ? JSON.stringify(card.legalities) : null,
    card.released_at,
    card.is_legendary === null ? null : card.is_legendary ? 1 : 0,
    card.layout,
    card.updated_at,
  ];
}

function enumerateDates(fromExclusive: string, toInclusive: string): string[] {
  const out: string[] = [];
  const from = new Date(fromExclusive);
  const to = new Date(toInclusive);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return out;
  const cursor = new Date(from);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= to) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return Infinity;
  return Math.abs(db - da) / 86400000;
}
