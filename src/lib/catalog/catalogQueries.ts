import { getCatalog } from './catalogDb';
import type { ScryfallCard } from '../scryfall';

// ─────────────────────────────────────────────────────────────────────────
// Local catalog queries — all run against the standalone catalog.db that
// carries the pre-compiled snapshot from the server. Results are shaped
// to match ScryfallCard so call sites don't need to know whether the hit
// came from local or the live API.
// ─────────────────────────────────────────────────────────────────────────

export async function isCatalogReady(): Promise<boolean> {
  const db = getCatalog();
  if (!db) return false;
  try {
    const res = await db.execute('SELECT COUNT(*) as c FROM cards LIMIT 1');
    const count = readScalar<number>(res, 'c');
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Read a single set's icon URI from the local catalog. Used by card
 * detail / prints list to avoid a network round-trip for every
 * set-icon render.
 */
export async function findSetIconLocal(setCode: string): Promise<string | null> {
  const db = getCatalog();
  if (!db) return null;
  const res = await db.execute(
    `SELECT icon_svg_uri FROM sets WHERE code = ? LIMIT 1`,
    [setCode.toLowerCase()]
  );
  return readScalar<string>(res, 'icon_svg_uri') ?? null;
}

/**
 * Batch variant for lists that render many set icons at once (e.g. the
 * prints sidebar on card detail).
 */
export async function findSetIconsLocal(setCodes: string[]): Promise<Record<string, string>> {
  const db = getCatalog();
  if (!db || setCodes.length === 0) return {};
  const unique = Array.from(new Set(setCodes.map((c) => c.toLowerCase())));
  const placeholders = unique.map(() => '?').join(',');
  const res = await db.execute(
    `SELECT code, icon_svg_uri FROM sets WHERE code IN (${placeholders})`,
    unique
  );
  const out: Record<string, string> = {};
  for (const row of readAllRows(res)) {
    if (row.icon_svg_uri) out[(row.code as string).toLowerCase()] = row.icon_svg_uri as string;
  }
  return out;
}

export async function findCardByScryfallId(scryfallId: string): Promise<ScryfallCard | null> {
  return queryOne(
    `SELECT * FROM cards WHERE scryfall_id = ? LIMIT 1`,
    [scryfallId]
  );
}

export async function findCardByPrint(
  setCode: string,
  collectorNumber: string
): Promise<ScryfallCard | null> {
  return queryOne(
    `SELECT * FROM cards WHERE set_code = ? AND collector_number = ? LIMIT 1`,
    [setCode.toLowerCase(), collectorNumber]
  );
}

export async function findCardByNameAndPrint(
  name: string,
  setCode: string,
  collectorNumber: string
): Promise<ScryfallCard | null> {
  return queryOne(
    `SELECT * FROM cards
     WHERE name = ? AND set_code = ? AND collector_number = ?
     LIMIT 1`,
    [name, setCode.toLowerCase(), collectorNumber]
  );
}

/**
 * First printing found by exact name match, newest first.
 */
export async function findCardByName(name: string): Promise<ScryfallCard | null> {
  return queryOne(
    `SELECT * FROM cards
     WHERE name = ?
     ORDER BY released_at DESC
     LIMIT 1`,
    [name]
  );
}

/**
 * Prefix autocomplete of distinct card names.
 */
export async function autocompleteNames(prefix: string, limit = 20): Promise<string[]> {
  if (!prefix || prefix.length < 2) return [];
  const db = getCatalog();
  if (!db) return [];
  const res = await db.execute(
    `SELECT DISTINCT name FROM cards
     WHERE name LIKE ? COLLATE NOCASE
     ORDER BY name ASC
     LIMIT ?`,
    [`${prefix}%`, limit]
  );
  return readAllRows(res).map((r) => (r.name ?? '') as string);
}

/**
 * Fuzzy search by name with Scryfall-parity defaults:
 *   - unique=art  → one printing per unique illustration_id, keeping the
 *     newest printing for each illustration.
 *   - order=edhrec → sort by EDHREC popularity rank (lowest rank first,
 *     nulls pushed to the bottom).
 *
 * A card like Lightning Bolt has ~15 unique illustrations across 80+
 * printings; this surfaces those 15 variants, most-played first.
 */
export async function searchByName(query: string, limit = 175): Promise<ScryfallCard[]> {
  if (!query || query.length < 2) return [];
  return queryMany(
    `SELECT c.* FROM cards c
     INNER JOIN (
       SELECT illustration_id, MAX(released_at) as latest
       FROM cards
       WHERE name LIKE ? COLLATE NOCASE AND illustration_id IS NOT NULL
       GROUP BY illustration_id
     ) latest_art
       ON c.illustration_id = latest_art.illustration_id
      AND (c.released_at = latest_art.latest OR latest_art.latest IS NULL)
     WHERE c.name LIKE ? COLLATE NOCASE
     ORDER BY
       CASE WHEN c.edhrec_rank IS NULL THEN 1 ELSE 0 END,
       c.edhrec_rank ASC,
       c.name ASC
     LIMIT ?`,
    [`%${query}%`, `%${query}%`, limit]
  );
}

export async function findPrintsByOracleId(oracleId: string, limit = 200): Promise<ScryfallCard[]> {
  return queryMany(
    `SELECT * FROM cards WHERE oracle_id = ? ORDER BY released_at DESC LIMIT ?`,
    [oracleId, limit]
  );
}

export async function findPrintsByName(name: string, limit = 200): Promise<ScryfallCard[]> {
  return queryMany(
    `SELECT * FROM cards WHERE name = ? ORDER BY released_at DESC LIMIT ?`,
    [name, limit]
  );
}

export async function findPrintsByNameInSet(
  name: string,
  setCode: string,
  limit = 50
): Promise<ScryfallCard[]> {
  return queryMany(
    `SELECT * FROM cards WHERE name = ? AND set_code = ? ORDER BY collector_number ASC LIMIT ?`,
    [name, setCode.toLowerCase(), limit]
  );
}

export async function countPrintsByName(name: string): Promise<number> {
  const db = getCatalog();
  if (!db) return 0;
  const res = await db.execute(`SELECT COUNT(*) as c FROM cards WHERE name = ?`, [name]);
  return readScalar<number>(res, 'c') ?? 0;
}

// Look up the Supabase cards.id UUID for a given scryfall_id without
// fetching the whole row. Used by ensureCardExists on the hot path.
export async function findSupabaseIdByScryfallId(scryfallId: string): Promise<string | null> {
  const db = getCatalog();
  if (!db) return null;
  const res = await db.execute(
    `SELECT id FROM cards WHERE scryfall_id = ? LIMIT 1`,
    [scryfallId]
  );
  return readScalar<string>(res, 'id') ?? null;
}

export type BatchKey = { key: string; setCode: string; collectorNumber: string };

/**
 * Resolve a batch of imports against the catalog in a single grouped query
 * per set. Reduces 100k lookups to ~N distinct sets worth of round-trips
 * instead of one SQL query per row.
 */
export async function batchResolveByPrint(keys: BatchKey[]): Promise<Map<string, ScryfallCard>> {
  const resolved = new Map<string, ScryfallCard>();
  const db = getCatalog();
  if (!db || keys.length === 0) return resolved;

  const bySet = new Map<string, BatchKey[]>();
  for (const k of keys) {
    const set = k.setCode.toLowerCase();
    const bucket = bySet.get(set) ?? [];
    bucket.push(k);
    bySet.set(set, bucket);
  }

  for (const [setCode, bucket] of bySet) {
    const nums = bucket.map((b) => b.collectorNumber);
    const placeholders = nums.map(() => '?').join(',');
    const res = await db.execute(
      `SELECT * FROM cards
       WHERE set_code = ? AND collector_number IN (${placeholders})`,
      [setCode, ...nums]
    );
    const rows = readAllRows(res);
    const byNum = new Map(rows.map((r) => [r.collector_number as string, r]));
    for (const b of bucket) {
      const row = byNum.get(b.collectorNumber);
      if (row) resolved.set(b.key, rowToScryfallCard(row));
    }
  }

  return resolved;
}

// ── Row helpers ───────────────────────────────────────────────────────────

async function queryOne(sql: string, params: any[]): Promise<ScryfallCard | null> {
  const db = getCatalog();
  if (!db) return null;
  const res = await db.execute(sql, params);
  const rows = readAllRows(res);
  return rows[0] ? rowToScryfallCard(rows[0]) : null;
}

async function queryMany(sql: string, params: any[]): Promise<ScryfallCard[]> {
  const db = getCatalog();
  if (!db) return [];
  const res = await db.execute(sql, params);
  return readAllRows(res).map(rowToScryfallCard);
}

function readAllRows(res: any): any[] {
  // QuickSQLite execute returns { rows: { _array: any[], length, item } }
  const array = res?.rows?._array;
  if (Array.isArray(array)) return array;
  const length = res?.rows?.length ?? 0;
  const out: any[] = [];
  for (let i = 0; i < length; i++) out.push(res.rows.item(i));
  return out;
}

function readScalar<T>(res: any, key: string): T | null {
  const rows = readAllRows(res);
  if (rows.length === 0) return null;
  return (rows[0]?.[key] ?? null) as T | null;
}

function rowToScryfallCard(row: any): ScryfallCard {
  const colors = parseJsonArray<string>(row.colors);
  const colorIdentity = parseJsonArray<string>(row.color_identity);
  const cardFaces = parseJsonValue<ScryfallCard['card_faces']>(row.card_faces);

  return {
    id: row.scryfall_id,
    oracle_id: row.oracle_id ?? '',
    name: row.name,
    mana_cost: row.mana_cost ?? undefined,
    cmc: row.cmc ?? 0,
    type_line: row.type_line ?? '',
    colors: colors ?? undefined,
    color_identity: colorIdentity ?? [],
    keywords: [],
    rarity: row.rarity ?? '',
    set: row.set_code ?? '',
    set_name: row.set_name ?? '',
    collector_number: row.collector_number ?? '',
    image_uris: row.image_uri_small
      ? {
          small: row.image_uri_small,
          normal: row.image_uri_normal ?? row.image_uri_small,
          large: row.image_uri_normal ?? row.image_uri_small,
          art_crop: row.image_uri_normal ?? row.image_uri_small,
        }
      : undefined,
    card_faces: cardFaces ?? undefined,
    artist: row.artist ?? undefined,
    prices: {
      usd: row.price_usd != null ? String(row.price_usd) : undefined,
      usd_foil: row.price_usd_foil != null ? String(row.price_usd_foil) : undefined,
      eur: row.price_eur != null ? String(row.price_eur) : undefined,
      eur_foil: row.price_eur_foil != null ? String(row.price_eur_foil) : undefined,
    },
    // oracle_text, power, toughness, loyalty, legalities, keywords, flavor_text
    // and artist are deliberately NOT in the local snapshot — they're fetched
    // in the background when the card detail screen opens. Offline detail
    // renders with these fields empty; online backfills silently.
    legalities: {},
    released_at: row.released_at ?? '',
    layout: row.layout ?? '',
  };
}

function parseJsonValue<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseJsonArray<T>(raw: string | null): T[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

export const catalogRowInternals = { rowToScryfallCard };
