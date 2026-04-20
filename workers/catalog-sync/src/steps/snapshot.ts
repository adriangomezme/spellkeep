import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { supabase } from '../supabase.ts';
import { config } from '../config.ts';

const SNAPSHOTS_BUCKET = 'catalog-snapshots';
const DELTAS_INDEX_BUCKET = 'catalog-deltas';
const INDEX_PATH = 'index.json';

const PAGE = 1000;
const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// PostgREST is fronted by Cloudflare on Supabase's hosted tier. Mid-sync
// we occasionally catch a 502 Bad Gateway — a transient proxy hiccup,
// not a real database error. Retry with exponential backoff before
// giving up; 6 attempts covers minute-long blips without hanging a full
// job. Non-502 errors bubble up immediately.
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message ?? err);
      const isTransient = /502|503|504|Bad Gateway|Gateway Time-out|ETIMEDOUT|ECONNRESET|fetch failed/i.test(msg);
      if (!isTransient || attempt === MAX_ATTEMPTS) break;
      const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
      console.warn(
        `[catalog-sync] ${label} transient failure (attempt ${attempt}/${MAX_ATTEMPTS}): ${msg.slice(0, 200)} — retrying in ${backoff} ms`
      );
      await sleep(backoff);
    }
  }
  throw lastErr;
}
const SNAPSHOT_REFRESH_DAYS = 7;

// Keep in lockstep with the client-side catalog schema.
// Intentionally excluded — fetched on-demand from Supabase when the card
// detail screen opens: oracle_text, power, toughness, loyalty, legalities,
// keywords, flavor_text, produced_mana, image_uri_large,
// image_uri_art_crop.
const CARD_COLUMNS = [
  'id',
  'scryfall_id',
  'oracle_id',
  'illustration_id',
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
  'price_usd_etched',
  'price_eur',
  'price_eur_foil',
  'released_at',
  'is_legendary',
  'layout',
  'card_faces',
  'edhrec_rank',
  'artist',
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

    console.log(
      `[catalog-sync] snapshot: ${raw.byteLength} bytes, sha256=${sha256.slice(0, 12)}…`
    );

    // Upload the raw .sqlite file. No gzip on our side: decompressing 80+ MB
    // in pure JS on the device blocks the UI for 15–30 s, which defeats the
    // whole point of a background catalog sync. Clients stream this file
    // straight to disk via expo-file-system, then open it with quick-sqlite
    // — zero JS-thread work during install.
    const objectPath = `${today}.sqlite`;
    const { error: upErr } = await supabase.storage
      .from(SNAPSHOTS_BUCKET)
      .upload(objectPath, raw, {
        contentType: 'application/vnd.sqlite3',
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
      snapshot_bytes: raw.byteLength,
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
      illustration_id TEXT,
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
      price_usd_etched REAL,
      price_eur REAL,
      price_eur_foil REAL,
      released_at TEXT,
      is_legendary INTEGER,
      layout TEXT,
      card_faces TEXT,
      edhrec_rank INTEGER,
      artist TEXT,
      updated_at TEXT
    );
    CREATE INDEX idx_cards_scryfall_id ON cards(scryfall_id);
    CREATE INDEX idx_cards_oracle_id ON cards(oracle_id);
    CREATE INDEX idx_cards_illustration_id ON cards(illustration_id);
    CREATE INDEX idx_cards_name ON cards(name COLLATE NOCASE);
    CREATE INDEX idx_cards_set_code ON cards(set_code);
    CREATE INDEX idx_cards_name_collector ON cards(name, collector_number);
    CREATE INDEX idx_cards_set_collector ON cards(set_code, collector_number);
    CREATE INDEX idx_cards_edhrec_rank ON cards(edhrec_rank) WHERE edhrec_rank IS NOT NULL;

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

async function pruneStaleSnapshots(currentVersion: string): Promise<void> {
  const { data: objects, error: listErr } = await supabase.storage
    .from(SNAPSHOTS_BUCKET)
    .list('', { limit: 1000 });
  if (listErr || !objects) return;

  const keep = `${currentVersion}.sqlite`;
  const toRemove = objects.map((o) => o.name).filter((name) => name !== keep);

  if (toRemove.length === 0) return;
  const { error: delErr } = await supabase.storage.from(SNAPSHOTS_BUCKET).remove(toRemove);
  if (delErr) {
    console.warn(`[catalog-sync] prune warning: ${delErr.message}`);
    return;
  }
  console.log(`[catalog-sync] pruned ${toRemove.length} stale snapshot files`);
}

async function fetchAllCards(): Promise<any[]> {
  const cols = CARD_COLUMNS.join(',');
  const all: any[] = [];

  // Keyset pagination: each page selects rows strictly greater than the
  // last seen scryfall_id. O(log n) per page via the unique index,
  // unlike OFFSET which degrades to O(n) and trips the 30 s statement
  // timeout. Each page is wrapped in withRetry so a transient Cloudflare
  // 502 mid-job doesn't throw away the rows we've already paged.
  let lastSeen: string | null = null;
  while (true) {
    const data = await withRetry('cards fetch', async () => {
      let query = supabase
        .from('cards')
        .select(cols)
        .order('scryfall_id', { ascending: true })
        .limit(PAGE);
      if (lastSeen !== null) query = query.gt('scryfall_id', lastSeen);
      const { data, error } = await query;
      if (error) throw new Error(`snapshot cards fetch failed: ${error.message}`);
      return data ?? [];
    });

    if (data.length === 0) break;

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
  // PostgREST caps responses at 1000 rows by default, so .range(0, 9999)
  // silently truncates. Page through with keyset pagination on `code`
  // (stable unique column) to be robust as the sets table grows.
  const cols = SET_COLUMNS.join(',');
  const all: any[] = [];
  let lastCode: string | null = null;
  while (true) {
    const data = await withRetry('sets fetch', async () => {
      let q = supabase
        .from('sets')
        .select(cols)
        .order('code', { ascending: true })
        .limit(PAGE);
      if (lastCode !== null) q = q.gt('code', lastCode);
      const { data, error } = await q;
      if (error) throw new Error(`snapshot sets fetch failed: ${error.message}`);
      return data ?? [];
    });
    if (data.length === 0) break;
    all.push(...data);
    lastCode = (data[data.length - 1] as any).code;
    if (data.length < PAGE) break;
  }
  return all;
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

