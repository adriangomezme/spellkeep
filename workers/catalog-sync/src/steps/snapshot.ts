import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import Database from 'better-sqlite3';
import { supabase } from '../supabase.ts';
import { config } from '../config.ts';
import { deltaInternals } from './delta.ts';

const SNAPSHOTS_BUCKET = 'catalog-snapshots';
const DELTAS_INDEX_PATH = 'index.json';
const PAGE = 1000;

const LIVE_CARD_COLUMNS = deltaInternals.LIVE_COLUMNS;

const SET_COLUMNS = [
  'code',
  'name',
  'set_type',
  'released_at',
  'card_count',
  'icon_svg_uri',
] as const;

/**
 * Builds a compact SQLite snapshot of the catalog and publishes it to Storage.
 * Skipped unless one of:
 *   - config.forceSnapshot is true
 *   - no snapshot exists yet
 *   - the latest snapshot is older than SNAPSHOT_REFRESH_DAYS
 */
const SNAPSHOT_REFRESH_DAYS = 7;

export async function buildSnapshot(): Promise<string | null> {
  if (!config.forceSnapshot && !(await shouldRegenerate())) {
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const tmpDir = join(tmpdir(), `spellkeep-catalog-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  const dbPath = join(tmpDir, `catalog-${today}.sqlite`);

  try {
    const db = new Database(dbPath);
    try {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');

      createSchema(db);
      await populateCards(db);
      await populateSets(db);

      db.pragma('wal_checkpoint(TRUNCATE)');
      db.exec('VACUUM');
    } finally {
      db.close();
    }

    const raw = readFileSync(dbPath);
    const gz = gzipSync(raw);

    const objectPath = `${today}.sqlite.gz`;
    const { error } = await supabase.storage
      .from(SNAPSHOTS_BUCKET)
      .upload(objectPath, gz, {
        contentType: 'application/octet-stream',
        cacheControl: '2592000, immutable',
        upsert: true,
      });
    if (error) throw new Error(`snapshot upload failed: ${error.message}`);

    const { data: pub } = supabase.storage.from(SNAPSHOTS_BUCKET).getPublicUrl(objectPath);
    const snapshotUrl = pub.publicUrl;

    await patchDeltasIndex({
      snapshot_version: today,
      snapshot_url: snapshotUrl,
      snapshot_raw_bytes: raw.byteLength,
      snapshot_gz_bytes: gz.byteLength,
    });

    console.log(`[catalog-sync] snapshot: ${raw.byteLength} bytes raw, ${gz.byteLength} bytes gz`);
    return snapshotUrl;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function shouldRegenerate(): Promise<boolean> {
  const { data } = await supabase.storage.from(SNAPSHOTS_BUCKET).list('', { limit: 100 });
  if (!data || data.length === 0) return true;

  const latest = data
    .filter((f) => f.name.endsWith('.sqlite.gz'))
    .sort((a, b) => (a.name < b.name ? 1 : -1))[0];

  if (!latest) return true;

  const dateStr = latest.name.replace('.sqlite.gz', '');
  const ageMs = Date.now() - new Date(dateStr).getTime();
  const ageDays = ageMs / 86400000;
  return ageDays >= SNAPSHOT_REFRESH_DAYS;
}

function createSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE cards (
      scryfall_id TEXT PRIMARY KEY,
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
      legalities TEXT,
      released_at TEXT,
      is_legendary INTEGER,
      layout TEXT,
      updated_at TEXT
    );
    CREATE INDEX idx_cards_name ON cards(name);
    CREATE INDEX idx_cards_set_code ON cards(set_code);
    CREATE INDEX idx_cards_oracle_id ON cards(oracle_id);
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

async function populateCards(db: Database.Database) {
  const cols = LIVE_CARD_COLUMNS.join(', ');
  const placeholders = LIVE_CARD_COLUMNS.map(() => '?').join(', ');
  const insert = db.prepare(`INSERT OR REPLACE INTO cards (${cols}) VALUES (${placeholders})`);

  const insertMany = db.transaction((rows: any[]) => {
    for (const row of rows) {
      insert.run(...LIVE_CARD_COLUMNS.map((c) => serialize(row[c])));
    }
  });

  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('cards')
      .select(cols)
      .order('scryfall_id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`snapshot cards fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;
    insertMany(data);
    from += data.length;
    if (data.length < PAGE) break;
  }
}

async function populateSets(db: Database.Database) {
  const cols = SET_COLUMNS.join(', ');
  const placeholders = SET_COLUMNS.map(() => '?').join(', ');
  const insert = db.prepare(`INSERT OR REPLACE INTO sets (${cols}) VALUES (${placeholders})`);
  const { data, error } = await supabase.from('sets').select(cols);
  if (error) throw new Error(`snapshot sets fetch failed: ${error.message}`);
  const insertMany = db.transaction((rows: any[]) => {
    for (const row of rows) insert.run(...SET_COLUMNS.map((c) => serialize(row[c])));
  });
  insertMany(data ?? []);
}

function serialize(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  return value as string | number;
}

async function patchDeltasIndex(patch: Record<string, unknown>): Promise<void> {
  let current: Record<string, unknown> = {};
  const { data: existing } = await supabase.storage.from('catalog-deltas').download(DELTAS_INDEX_PATH);
  if (existing) {
    try {
      current = JSON.parse(await existing.text());
    } catch {}
  }
  const next = { ...current, ...patch, updated_at: new Date().toISOString() };
  const body = new Blob([JSON.stringify(next, null, 2)], { type: 'application/json' });
  const { error } = await supabase.storage
    .from('catalog-deltas')
    .upload(DELTAS_INDEX_PATH, body, {
      contentType: 'application/json',
      cacheControl: '300',
      upsert: true,
    });
  if (error) throw new Error(`index patch failed: ${error.message}`);
}
