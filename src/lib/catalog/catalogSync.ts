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

// Apply catalog rows in chunks to avoid a single giant transaction.
const APPLY_CHUNK = 500;

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
 * Entry point: call once at app startup. Runs the whole "check-and-sync"
 * flow in the background. Safe to call multiple times — it no-ops if a
 * run is already in flight.
 */
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

    // Case 1: nothing locally — bootstrap from snapshot.
    if (!localSnapshot) {
      await applySnapshotFromUrl(remoteIndex.snapshot_url, remoteIndex.snapshot_version);
      if (remoteIndex.latest_delta) {
        await setMeta(META_KEYS.lastDelta, remoteIndex.latest_delta);
      }
      await finalize(remoteIndex.snapshot_version);
      return;
    }

    // Case 2: snapshot newer on server — re-bootstrap if we're far behind.
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

    // Case 3: catch up with deltas.
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
  const payload = await fetchJsonGz<SnapshotPayload>(url);
  publish({ status: 'applying', progress: 0 });
  await applySnapshotPayload(payload);
  await setMeta(META_KEYS.snapshotVersion, version);
}

async function applySnapshotPayload(payload: SnapshotPayload): Promise<void> {
  const cards = payload.cards;
  const sets = payload.sets;
  const totalUnits = cards.length + sets.length;
  let done = 0;

  for (let i = 0; i < cards.length; i += APPLY_CHUNK) {
    const chunk = cards.slice(i, i + APPLY_CHUNK);
    await applyCardsChunk(chunk);
    done += chunk.length;
    publish({ status: 'applying', progress: done / totalUnits });
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
    const delta = await fetchJsonGz<CatalogDelta>(url).catch(() => null);
    if (delta?.changed_cards?.length) {
      publish({ status: 'applying', progress: (i + 0.5) / dates.length });
      for (let j = 0; j < delta.changed_cards.length; j += APPLY_CHUNK) {
        await applyCardsChunk(delta.changed_cards.slice(j, j + APPLY_CHUNK));
      }
    }
    publish({ progress: (i + 1) / dates.length });
  }
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

// ── Network helpers ────────────────────────────────────────────────────────

async function fetchJsonGz<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const json = pako.ungzip(buf, { to: 'string' });
  return JSON.parse(json) as T;
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
