import { supabase } from '../supabase.ts';
import type { ParsedLine } from '../parser/tabletopTxt.ts';

/**
 * Resolves a parsed deck list into canonical Scryfall IDs and the
 * type_line / color_identity needed downstream (for category derivation
 * and the deck's compact `colors` string).
 *
 * MTGGoldfish's Tabletop export gives us heterogeneous hints:
 *   1. Some lines carry a Scryfall UUID directly — easiest case.
 *   2. Some carry a numeric collector number — `set_code + cn` is a
 *      strong key (English print) once we lower-case the set.
 *   3. Some carry only `name + set` — we fall back to the first
 *      English print of that name in that set.
 *
 * Catalog completeness is a real concern for very-newest sets where
 * the daily Scryfall snapshot may not yet have ingested every card.
 * Lines that fail every lookup are dropped with a warning; the rest
 * of the deck still ships.
 */
export type ResolvedRow = {
  /** Index of the source line (matches the input array). */
  index: number;
  scryfall_id: string;
  type_line: string;
  /** Color identity from the catalog row — jsonb array (`['G']`). */
  color_identity: string[];
};

type CatalogRow = {
  scryfall_id: string;
  type_line: string | null;
  color_identity: string[] | string | null;
  set_code: string;
  collector_number: string;
  name: string;
};

const LANG = 'en';

export async function resolveDeck(
  lines: ParsedLine[]
): Promise<{ resolved: ResolvedRow[]; missing: ParsedLine[] }> {
  if (lines.length === 0) return { resolved: [], missing: [] };

  // Bucket lines by lookup strategy. Each bucket gets one focused
  // query, then we map results back to the original line index.
  const uuidLines: Array<{ index: number; line: ParsedLine; uuid: string }> = [];
  const cnLines: Array<{ index: number; line: ParsedLine; cn: string }> = [];
  const nameOnlyLines: Array<{ index: number; line: ParsedLine }> = [];

  lines.forEach((line, index) => {
    if (line.hint?.kind === 'uuid') {
      uuidLines.push({ index, line, uuid: line.hint.value });
    } else if (line.hint?.kind === 'collectorNumber') {
      cnLines.push({ index, line, cn: line.hint.value });
    } else {
      // `treatment` hints fall through to the name+set lookup since
      // we can't do better without scraping more pages.
      nameOnlyLines.push({ index, line });
    }
  });

  const resolved: ResolvedRow[] = [];
  const claimed = new Set<number>();

  // ── 1. UUID hints — single batched IN query ─────────────────────
  if (uuidLines.length > 0) {
    const uuids = Array.from(new Set(uuidLines.map((u) => u.uuid)));
    const rows = await fetchByIds(uuids);
    const byId = new Map(rows.map((r) => [r.scryfall_id, r] as const));
    for (const { index, uuid } of uuidLines) {
      const row = byId.get(uuid);
      if (row) {
        resolved.push(toResolved(index, row));
        claimed.add(index);
      }
    }
  }

  // ── 2. (set, collector_number) — one query per set ──────────────
  const cnBySet = new Map<string, Array<{ index: number; cn: string }>>();
  for (const { index, line, cn } of cnLines) {
    if (claimed.has(index)) continue;
    const arr = cnBySet.get(line.set) ?? [];
    arr.push({ index, cn });
    cnBySet.set(line.set, arr);
  }
  for (const [set, items] of cnBySet) {
    const cns = Array.from(new Set(items.map((i) => i.cn)));
    const rows = await fetchBySetAndCollectorNumbers(set, cns);
    const byKey = new Map(
      rows.map((r) => [`${r.set_code}|${r.collector_number}`, r] as const)
    );
    for (const { index, cn } of items) {
      const row = byKey.get(`${set}|${cn}`);
      if (row) {
        resolved.push(toResolved(index, row));
        claimed.add(index);
      }
    }
  }

  // ── 3. (set, name) — collect everything still unclaimed including
  //     CN lines whose collector number didn't resolve.
  const nameBySet = new Map<string, Array<{ index: number; name: string }>>();
  const collectFallback = (index: number, line: ParsedLine) => {
    if (claimed.has(index)) return;
    const arr = nameBySet.get(line.set) ?? [];
    arr.push({ index, name: line.name });
    nameBySet.set(line.set, arr);
  };
  cnLines.forEach(({ index, line }) => collectFallback(index, line));
  nameOnlyLines.forEach(({ index, line }) => collectFallback(index, line));

  for (const [set, items] of nameBySet) {
    const names = Array.from(new Set(items.map((i) => i.name)));
    const rows = await fetchBySetAndNames(set, names);
    // Pick a representative print per (set, name) — sort by collector
    // number to get a deterministic choice, prefer purely-numeric
    // collector numbers first (those are the "main" prints; promos
    // and special treatments tend to use suffixed numbers).
    const byKey = new Map<string, CatalogRow>();
    for (const row of rows) {
      const key = `${row.set_code}|${row.name}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, row);
        continue;
      }
      if (preferPrint(row, existing)) byKey.set(key, row);
    }
    for (const { index, name } of items) {
      const row = byKey.get(`${set}|${name}`);
      if (row) {
        resolved.push(toResolved(index, row));
        claimed.add(index);
      }
    }
  }

  // Anything still unclaimed is missing from the catalog.
  const missing: ParsedLine[] = [];
  lines.forEach((line, index) => {
    if (!claimed.has(index)) missing.push(line);
  });

  // Stable order by source index so the caller can interleave with
  // the parsed list trivially.
  resolved.sort((a, b) => a.index - b.index);
  return { resolved, missing };
}

function toResolved(index: number, row: CatalogRow): ResolvedRow {
  return {
    index,
    scryfall_id: row.scryfall_id,
    type_line: row.type_line ?? '',
    color_identity: normalizeColorIdentity(row.color_identity),
  };
}

function normalizeColorIdentity(raw: CatalogRow['color_identity']): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((c) => String(c).toUpperCase());
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === '[]') return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((c) => String(c).toUpperCase());
    } catch {
      /* fall through */
    }
  }
  return [];
}

/**
 * Prefer prints whose collector_number is purely numeric (the
 * "regular" slot in the set), and within that pick the lower number.
 * Special-treatment prints in the same set get suffix letters like
 * `★`, `s`, `a` — we want to skip those when a clean print exists.
 */
function preferPrint(candidate: CatalogRow, current: CatalogRow): boolean {
  const cIsNumeric = /^[0-9]+$/.test(candidate.collector_number);
  const eIsNumeric = /^[0-9]+$/.test(current.collector_number);
  if (cIsNumeric && !eIsNumeric) return true;
  if (!cIsNumeric && eIsNumeric) return false;
  return collectorNumeric(candidate.collector_number) <
    collectorNumeric(current.collector_number);
}

function collectorNumeric(cn: string): number {
  const m = /^([0-9]+)/.exec(cn);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

const SELECT = 'scryfall_id, type_line, color_identity, set_code, collector_number, name';

async function fetchByIds(ids: string[]): Promise<CatalogRow[]> {
  if (ids.length === 0) return [];
  const out: CatalogRow[] = [];
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('cards')
      .select(SELECT)
      .in('scryfall_id', slice);
    if (error) throw new Error(`cards by id failed: ${error.message}`);
    out.push(...((data ?? []) as CatalogRow[]));
  }
  return out;
}

async function fetchBySetAndCollectorNumbers(
  set: string,
  cns: string[]
): Promise<CatalogRow[]> {
  if (cns.length === 0) return [];
  const { data, error } = await supabase
    .from('cards')
    .select(SELECT)
    .eq('set_code', set)
    .eq('lang', LANG)
    .in('collector_number', cns);
  if (error) throw new Error(`cards ${set} by cn failed: ${error.message}`);
  return (data ?? []) as CatalogRow[];
}

async function fetchBySetAndNames(
  set: string,
  names: string[]
): Promise<CatalogRow[]> {
  if (names.length === 0) return [];
  const out: CatalogRow[] = [];
  const CHUNK = 100;
  for (let i = 0; i < names.length; i += CHUNK) {
    const slice = names.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('cards')
      .select(SELECT)
      .eq('set_code', set)
      .eq('lang', LANG)
      .in('name', slice);
    if (error) throw new Error(`cards ${set} by name failed: ${error.message}`);
    out.push(...((data ?? []) as CatalogRow[]));
  }
  return out;
}
