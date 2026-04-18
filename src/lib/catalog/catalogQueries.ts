import { db } from '../powersync/system';
import type { ScryfallCard } from '../scryfall';

// ─────────────────────────────────────────────────────────────────────────
// Local catalog queries — same shape as ScryfallCard so callers don't
// need to care whether a hit came from local or the live API.
// ─────────────────────────────────────────────────────────────────────────

export async function isCatalogReady(): Promise<boolean> {
  const row = await db.getOptional<{ c: number }>(
    `SELECT COUNT(*) as c FROM catalog_cards LIMIT 1`
  );
  return (row?.c ?? 0) > 0;
}

export async function findCardByScryfallId(scryfallId: string): Promise<ScryfallCard | null> {
  const row = await db.getOptional<CatalogRow>(
    `SELECT * FROM catalog_cards WHERE scryfall_id = ? LIMIT 1`,
    [scryfallId]
  );
  return row ? rowToScryfallCard(row) : null;
}

export async function findCardByPrint(
  setCode: string,
  collectorNumber: string
): Promise<ScryfallCard | null> {
  const row = await db.getOptional<CatalogRow>(
    `SELECT * FROM catalog_cards
     WHERE set_code = ? AND collector_number = ?
     LIMIT 1`,
    [setCode.toLowerCase(), collectorNumber]
  );
  return row ? rowToScryfallCard(row) : null;
}

export async function findCardByNameAndPrint(
  name: string,
  setCode: string,
  collectorNumber: string
): Promise<ScryfallCard | null> {
  const row = await db.getOptional<CatalogRow>(
    `SELECT * FROM catalog_cards
     WHERE name = ? AND set_code = ? AND collector_number = ?
     LIMIT 1`,
    [name, setCode.toLowerCase(), collectorNumber]
  );
  return row ? rowToScryfallCard(row) : null;
}

/**
 * First printing found by exact name match, ordered by released_at DESC
 * so the latest print wins. Useful as a "just find me any version" fallback.
 */
export async function findCardByName(name: string): Promise<ScryfallCard | null> {
  const row = await db.getOptional<CatalogRow>(
    `SELECT * FROM catalog_cards
     WHERE name = ?
     ORDER BY released_at DESC NULLS LAST
     LIMIT 1`,
    [name]
  );
  return row ? rowToScryfallCard(row) : null;
}

/**
 * Prefix-match autocomplete. Case-insensitive via COLLATE NOCASE on the index
 * would be ideal but we match what Scryfall does: prefix over distinct names.
 */
export async function autocompleteNames(prefix: string, limit = 20): Promise<string[]> {
  if (!prefix || prefix.length < 2) return [];
  const rows = await db.getAll<{ name: string }>(
    `SELECT DISTINCT name FROM catalog_cards
     WHERE name LIKE ? COLLATE NOCASE
     ORDER BY name ASC
     LIMIT ?`,
    [`${prefix}%`, limit]
  );
  return rows.map((r) => r.name);
}

/**
 * Full-text-ish search by name token. Returns distinct-by-name results so
 * the list isn't polluted by every reprint of the same card.
 */
export async function searchByName(query: string, limit = 50): Promise<ScryfallCard[]> {
  if (!query || query.length < 2) return [];
  const rows = await db.getAll<CatalogRow>(
    `SELECT c.* FROM catalog_cards c
     INNER JOIN (
       SELECT name, MAX(released_at) as latest
       FROM catalog_cards
       WHERE name LIKE ? COLLATE NOCASE
       GROUP BY name
     ) latest_by_name
       ON c.name = latest_by_name.name
      AND (c.released_at = latest_by_name.latest OR latest_by_name.latest IS NULL)
     ORDER BY c.name ASC
     LIMIT ?`,
    [`%${query}%`, limit]
  );
  return rows.map(rowToScryfallCard);
}

/**
 * All printings that share this oracle_id, newest first. Backs fetchPrints.
 */
export async function findPrintsByOracleId(oracleId: string, limit = 200): Promise<ScryfallCard[]> {
  const rows = await db.getAll<CatalogRow>(
    `SELECT * FROM catalog_cards
     WHERE oracle_id = ?
     ORDER BY released_at DESC NULLS LAST
     LIMIT ?`,
    [oracleId, limit]
  );
  return rows.map(rowToScryfallCard);
}

/**
 * All printings of a card with this exact name, newest first.
 * Backs VersionPicker's "all prints of X" list.
 */
export async function findPrintsByName(name: string, limit = 200): Promise<ScryfallCard[]> {
  const rows = await db.getAll<CatalogRow>(
    `SELECT * FROM catalog_cards
     WHERE name = ?
     ORDER BY released_at DESC NULLS LAST
     LIMIT ?`,
    [name, limit]
  );
  return rows.map(rowToScryfallCard);
}

/**
 * All printings of a card with this exact name inside a given set.
 */
export async function findPrintsByNameInSet(
  name: string,
  setCode: string,
  limit = 50
): Promise<ScryfallCard[]> {
  const rows = await db.getAll<CatalogRow>(
    `SELECT * FROM catalog_cards
     WHERE name = ? AND set_code = ?
     ORDER BY collector_number ASC
     LIMIT ?`,
    [name, setCode.toLowerCase(), limit]
  );
  return rows.map(rowToScryfallCard);
}

/**
 * Count prints for a given card name. Useful when a caller only wants to
 * know if local has anything before hitting the API.
 */
export async function countPrintsByName(name: string): Promise<number> {
  const row = await db.getOptional<{ c: number }>(
    `SELECT COUNT(*) as c FROM catalog_cards WHERE name = ?`,
    [name]
  );
  return row?.c ?? 0;
}

/**
 * Resolve a batch of parsed imports against the local catalog in a single
 * query per index. Returns a map keyed by the caller's key function so the
 * caller can pair them back up.
 */
export type BatchKey = { key: string; setCode: string; collectorNumber: string };

export async function batchResolveByPrint(keys: BatchKey[]): Promise<Map<string, ScryfallCard>> {
  const resolved = new Map<string, ScryfallCard>();
  if (keys.length === 0) return resolved;

  // Group by setCode for efficient queries (one per set) — keeps param counts low.
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
    const rows = await db.getAll<CatalogRow>(
      `SELECT * FROM catalog_cards
       WHERE set_code = ? AND collector_number IN (${placeholders})`,
      [setCode, ...nums]
    );

    const byNum = new Map(rows.map((r) => [r.collector_number, r]));
    for (const b of bucket) {
      const row = byNum.get(b.collectorNumber);
      if (row) resolved.set(b.key, rowToScryfallCard(row));
    }
  }

  return resolved;
}

// ─────────────────────────────────────────────────────────────────────────
// Raw row shape stored in catalog_cards
// ─────────────────────────────────────────────────────────────────────────

type CatalogRow = {
  id: string;
  scryfall_id: string;
  oracle_id: string | null;
  name: string;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string | null;
  colors: string | null;         // JSON string
  color_identity: string | null; // JSON string
  rarity: string | null;
  set_code: string | null;
  set_name: string | null;
  collector_number: string | null;
  image_uri_small: string | null;
  image_uri_normal: string | null;
  price_usd: number | null;
  price_usd_foil: number | null;
  price_eur: number | null;
  price_eur_foil: number | null;
  legalities: string | null;     // JSON string
  released_at: string | null;
  is_legendary: number | null;   // 0/1
  layout: string | null;
  updated_at: string;
};

function rowToScryfallCard(row: CatalogRow): ScryfallCard {
  const colors = parseJsonArray<string>(row.colors);
  const colorIdentity = parseJsonArray<string>(row.color_identity);
  const legalities = parseJsonObject<Record<string, string>>(row.legalities) ?? {};

  return {
    id: row.scryfall_id, // ScryfallCard.id is scryfall_id in callers
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
    prices: {
      usd: row.price_usd != null ? String(row.price_usd) : undefined,
      usd_foil: row.price_usd_foil != null ? String(row.price_usd_foil) : undefined,
      eur: row.price_eur != null ? String(row.price_eur) : undefined,
      eur_foil: row.price_eur_foil != null ? String(row.price_eur_foil) : undefined,
    },
    legalities,
    released_at: row.released_at ?? '',
    layout: row.layout ?? '',
  };
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

function parseJsonObject<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const catalogRowInternals = { rowToScryfallCard };
