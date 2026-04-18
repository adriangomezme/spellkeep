import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import Database from 'better-sqlite3';
import { supabase } from '../supabase.ts';
import { config } from '../config.ts';

const SNAPSHOTS_BUCKET = 'catalog-snapshots';
const DELTAS_INDEX_BUCKET = 'catalog-deltas';
const INDEX_PATH = 'index.json';

const PAGE = 1000;
const SNAPSHOT_REFRESH_DAYS = 7;

// Keep in lockstep with the client-side Attached catalog schema.
// Note: legalities is intentionally excluded — it adds ~40% to the payload
// but is only used by deck validation (rare flow). Client fetches it
// on demand from Supabase when needed.
const CARD_COLUMNS = [
  'id',
  'scryfall_id',
  'oracle_id',
  'name',
  'mana_cost',
  'cmc',
  'type_line',
  'colors',
  'color_identity',
  'rarity',
  'set_code',
  'set_name',
  'collector_number',
  'image_uri_small',
  'image_uri_normal',
  'price_usd',
  'price_usd_foil',
  'price_eur',
  'price_eur_foil',
  'released_at',
  'is_legendary',
  'layout',
  'updated_at',
] as const;

const SET_COLUMNS = [
  'code',
  'name',
  'set_type',
  'released_at',
  'card_count',
  'icon_svg_uri',
] as const;

/**
 * Builds a compact pre-compiled SQLite database of the catalog, gzips it,
 * and publishes it to Storage as `catalog-<date>.sqlite.gz` plus an
 * `index.json` sibling in catalog-deltas/ that clients poll.
 *
 * Why SQLite as the wire format? The client uses ATTACH DATABASE to plug
 * this file into its existing PowerSync-managed connection, skipping
 * JSON.parse and the associated JS-thread stalls entirely. Queries against
 * the catalog run natively via SQLite indexes the moment the file lands.
 */
export async function buildSnapshot(): Promise<string | null> {
  if (!config.forceSnapshot && !(await shouldRegenerate())) {
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const tmpDir = join(tmpdir(), `spellkeep-catalog-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  const dbPath = join(tmpDir, `catalog-${today}.sqlite`);

  try {
    console.log('[catalog-sync] fetching cards + sets for snapshot…');
    const cards = await fetchAllCards();
    const sets = await fetchAllSets();
    console.log(`[catalog-sync] fetched ${cards.length} cards, ${sets.length} sets`);

    console.log('[catalog-sync] building SQLite snapshot…');
    const db = new Database(dbPath);
    try {
      db.pragma('journal_mode = OFF');
      db.pragma('synchronous = OFF');
      db.pragma('locking_mode = EXCLUSIVE');
      db.pragma('temp_store = MEMORY');

      createSchema(db);
      insertCards(db, cards);
      insertSets(db, sets);

      // Make the resulting DB compact and seekable, and update stats for the
      // query planner so clients hit indexes immediately.
      db.exec('ANALYZE;');
      db.exec('VACUUM;');
    } finally {
      db.close();
    }

    const raw = readFileSync(dbPath);
    const sha256 = createHash('sha256').update(raw).digest('hex');
    const gz = gzipSync(raw);

    console.log(
      `[catalog-sync] snapshot: ${raw.byteLength} bytes raw, ${gz.byteLength} bytes gz, sha256=${sha256.slice(0, 12)}…`
    );

    const objectPath = `${today}.sqlite.gz`;
    const { error: upErr } = await supabase.storage
      .from(SNAPSHOTS_BUCKET)
      .upload(objectPath, gz, {
        contentType: 'application/octet-stream',
        cacheControl: '2592000, immutable',
        upsert: true,
      });
    if (upErr) throw new Error(`snapshot upload failed: ${upErr.message}`);

    const { data: pub } = supabase.storage.from(SNAPSHOTS_BUCKET).getPublicUrl(objectPath);
    const snapshotUrl = pub.publicUrl;

    await writeIndex({
      snapshot_version: today,
      snapshot_url: snapshotUrl,
      snapshot_sha256: sha256,
      snapshot_raw_bytes: raw.byteLength,
      snapshot_gz_bytes: gz.byteLength,
      snapshot_card_count: cards.length,
      snapshot_set_count: sets.length,
    });

    await pruneStaleSnapshots(today);

    return snapshotUrl;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function createSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE cards (
      id TEXT PRIMARY KEY,
      scryfall_id TEXT NOT NULL UNIQUE,
      oracle_id TEXT,
      name TEXT NOT NULL,
      mana_cost TEXT,
      cmc REAL,
      type_line TEXT,
      colors TEXT,
      color_identity TEXT,
      rarity TEXT,
      set_code TEXT,
      set_name TEXT,
      collector_number TEXT,
      image_uri_small TEXT,
      image_uri_normal TEXT,
      price_usd REAL,
      price_usd_foil REAL,
      price_eur REAL,
      price_eur_foil REAL,
      released_at TEXT,
      is_legendary INTEGER,
      layout TEXT,
      updated_at TEXT
    );
    CREATE INDEX idx_cards_scryfall_id ON cards(scryfall_id);
    CREATE INDEX idx_cards_oracle_id ON cards(oracle_id);
    CREATE INDEX idx_cards_name ON cards(name COLLATE NOCASE);
    CREATE INDEX idx_cards_set_code ON cards(set_code);
    CREATE INDEX idx_cards_name_collector ON cards(name, collector_number);
    CREATE INDEX idx_cards_set_collector ON cards(set_code, collector_number);

    CREATE TABLE sets (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      set_type TEXT,
      released_at TEXT,
      card_count INTEGER,
      icon_svg_uri TEXT
    );
    CREATE INDEX idx_sets_name ON sets(name);
  `);
}

function insertCards(db: Database.Database, rows: any[]) {
  const cols = CARD_COLUMNS.join(', ');
  const placeholders = CARD_COLUMNS.map(() => '?').join(', ');
  const insert = db.prepare(`INSERT INTO cards (${cols}) VALUES (${placeholders})`);
  const many = db.transaction((batch: any[]) => {
    for (const row of batch) {
      insert.run(...CARD_COLUMNS.map((c) => serialize(row[c])));
    }
  });
  many(rows);
}

function insertSets(db: Database.Database, rows: any[]) {
  const cols = SET_COLUMNS.join(', ');
  const placeholders = SET_COLUMNS.map(() => '?').join(', ');
  const insert = db.prepare(`INSERT INTO sets (${cols}) VALUES (${placeholders})`);
  const many = db.transaction((batch: any[]) => {
    for (const row of batch) {
      insert.run(...SET_COLUMNS.map((c) => serialize(row[c])));
    }
  });
  many(rows);
}

function serialize(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  return value as string | number;
}

async function shouldRegenerate(): Promise<boolean> {
  // Use the published index.json as the single source of truth for versioning.
  const { data } = await supabase.storage.from(DELTAS_INDEX_BUCKET).download(INDEX_PATH);
  if (!data) return true;
  try {
    const current = JSON.parse(await data.text());
    const version = current.snapshot_version as string | undefined;
    if (!version) return true;
    const ageDays = (Date.now() - new Date(version).getTime()) / 86400000;
    return ageDays >= SNAPSHOT_REFRESH_DAYS;
  } catch {
    return true;
  }
}

async function fetchAllCards(): Promise<any[]> {
  const cols = CARD_COLUMNS.join(',');
  const all: any[] = [];

  // Keyset pagination: each page selects rows strictly greater than the last
  // seen scryfall_id. O(log n) per page via the unique index, unlike
  // OFFSET which degrades to O(n) and trips the 30 s statement timeout.
  let lastSeen: string | null = null;
  while (true) {
    let query = supabase
      .from('cards')
      .select(cols)
      .order('scryfall_id', { ascending: true })
      .limit(PAGE);
    if (lastSeen !== null) query = query.gt('scryfall_id', lastSeen);

    const { data, error } = await query;
    if (error) throw new Error(`snapshot cards fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;

    all.push(...data);
    lastSeen = (data[data.length - 1] as any).scryfall_id;

    if (data.length < PAGE) break;
    if (all.length % 20000 === 0) {
      console.log(`[catalog-sync] fetched ${all.length} cards…`);
    }
  }
  return all;
}

async function fetchAllSets(): Promise<any[]> {
  const { data, error } = await supabase
    .from('sets')
    .select(SET_COLUMNS.join(','))
    .range(0, 9999);
  if (error) throw new Error(`snapshot sets fetch failed: ${error.message}`);
  return data ?? [];
}

async function writeIndex(patch: Record<string, unknown>): Promise<void> {
  const payload = {
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const body = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const { error } = await supabase.storage
    .from(DELTAS_INDEX_BUCKET)
    .upload(INDEX_PATH, body, {
      contentType: 'application/json',
      cacheControl: '60',
      upsert: true,
    });
  if (error) throw new Error(`index write failed: ${error.message}`);
}

async function pruneStaleSnapshots(currentVersion: string): Promise<void> {
  // Keep the current snapshot and nothing else — old ones become orphans.
  // Any client still on the previous version re-downloads the new one on
  // next app open. Storage cost is negligible either way; this just keeps
  // the bucket tidy.
  const { data: objects, error: listErr } = await supabase.storage
    .from(SNAPSHOTS_BUCKET)
    .list('', { limit: 1000 });
  if (listErr || !objects) return;

  const toRemove = objects
    .map((o) => o.name)
    .filter((name) => name !== `${currentVersion}.sqlite.gz`);

  if (toRemove.length === 0) return;
  const { error: delErr } = await supabase.storage.from(SNAPSHOTS_BUCKET).remove(toRemove);
  if (delErr) {
    console.warn(`[catalog-sync] prune warning: ${delErr.message}`);
    return;
  }
  console.log(`[catalog-sync] pruned ${toRemove.length} stale snapshot files`);
}
