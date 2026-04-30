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
  layout?: string | null;
  released_at?: string | null;
};

/** Layouts that don't render usefully in a meta-deck carousel. */
const SKIP_LAYOUTS = new Set([
  'art_series',
  'token',
  'double_faced_token',
  'emblem',
  'planar',
  'scheme',
  'vanguard',
  'reversible_card',
  'minigame',
]);

/**
 * Set types whose prints we treat as "canonical" reprints when
 * choosing a representative for the global name-only fallback. Other
 * types (promos, memorabilia/Secret Lair, masterpieces) only win if
 * absolutely no canonical print exists.
 */
const CANONICAL_SET_TYPES = new Set([
  'expansion',
  'core',
  'masters',
  'commander',
  'draft_innovation',
  'starter',
  'duel_deck',
  'box',
]);

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
  //     UUID lines whose id wasn't in the catalog (MTGGoldfish often
  //     points at a special-treatment print that the daily snapshot
  //     hasn't ingested) and CN lines whose collector number missed.
  //     The same card almost always exists in the same set under a
  //     different print; the name+set fallback gets us back to it.
  const nameBySet = new Map<string, Array<{ index: number; name: string }>>();
  const collectFallback = (index: number, line: ParsedLine) => {
    if (claimed.has(index)) return;
    const arr = nameBySet.get(line.set) ?? [];
    arr.push({ index, name: line.name });
    nameBySet.set(line.set, arr);
  };
  uuidLines.forEach(({ index, line }) => collectFallback(index, line));
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

  // ── 4. DFC / split-card fallback. MTGGoldfish writes only the
  //     front face for double-faced cards (`Brightclimb Pathway`)
  //     and condensed slashes for splits (`Wear/Tear`,
  //     `Unholy Annex/Ritual Chamber`). Scryfall stores the full
  //     `front // back` string. Match by `name LIKE '<front> //%'`
  //     where <front> is the prefix before any `/` in the source line.
  const dfcBySet = new Map<string, Array<{ index: number; front: string }>>();
  for (const [set, items] of nameBySet) {
    for (const { index, name } of items) {
      if (claimed.has(index)) continue;
      const front = name.split('/')[0]!.trim();
      if (!front) continue;
      const arr = dfcBySet.get(set) ?? [];
      arr.push({ index, front });
      dfcBySet.set(set, arr);
    }
  }
  for (const [set, items] of dfcBySet) {
    const fronts = Array.from(new Set(items.map((i) => i.front)));
    const rows = await fetchBySetAndDfcFronts(set, fronts);
    const byFront = new Map<string, CatalogRow>();
    for (const row of rows) {
      const front = row.name.split('//')[0]!.trim();
      const key = `${row.set_code}|${front}`;
      const existing = byFront.get(key);
      if (!existing || preferPrint(row, existing)) byFront.set(key, row);
    }
    for (const { index, front } of items) {
      const row = byFront.get(`${set}|${front}`);
      if (row) {
        resolved.push(toResolved(index, row));
        claimed.add(index);
      }
    }
  }

  // ── 5. Name-only global fallback. Some MTGGoldfish lines cite a
  //     set we don't ingest (e.g. mb1 — Mystery Booster only ships
  //     under fmb1 in Scryfall snapshots). The card almost always
  //     exists under a different set as a normal printing; we just
  //     need to find ANY representative print so the carousel has
  //     an image.
  //
  //     We exclude special layouts (art_series, token, etc.) and
  //     promo/memorabilia/masterpiece set types so the fallback
  //     doesn't surface Secret Lair art or oversized tokens; among
  //     what's left we pick the most recent release because the
  //     contemporary reprint is the one MTG players recognize.
  const stillMissing = lines
    .map((line, index) => ({ line, index }))
    .filter(({ index }) => !claimed.has(index));
  if (stillMissing.length > 0) {
    const dfcAware = (name: string): string[] => {
      // The line carries only the front face; expand to also try
      // `front //%` so DFCs in unknown sets resolve too.
      const front = name.split('/')[0]!.trim();
      return front && front !== name ? [name, front] : [name];
    };
    const wanted = new Set<string>();
    for (const { line } of stillMissing) {
      for (const variant of dfcAware(line.name)) wanted.add(variant);
    }
    const rows = await fetchByNamesGlobal(Array.from(wanted));
    // Group rows by exact name and by front-face. preferPrintGlobal
    // ranks within each name so we pick the canonical reprint.
    const byExact = new Map<string, CatalogRow>();
    const byFront = new Map<string, CatalogRow>();
    for (const row of rows) {
      const exactKey = row.name;
      const e = byExact.get(exactKey);
      if (!e || preferPrintGlobal(row, e)) byExact.set(exactKey, row);
      const front = row.name.split('//')[0]!.trim();
      const frontKey = front;
      const f = byFront.get(frontKey);
      if (!f || preferPrintGlobal(row, f)) byFront.set(frontKey, row);
    }
    for (const { index, line } of stillMissing) {
      const front = line.name.split('/')[0]!.trim();
      const row = byExact.get(line.name) ?? byFront.get(front);
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
const SELECT_GLOBAL =
  'scryfall_id, type_line, color_identity, set_code, collector_number, name, layout, released_at';

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

/**
 * Global name-only lookup used as the last-resort fallback when even
 * the (set, name) tier failed. We then need a set-type filter so we
 * don't surface Secret Lair art / oversized tokens — that's why we
 * also load `set_type` for every set_code that came back and rank
 * canonical reprints first via `preferPrintGlobal`.
 */
async function fetchByNamesGlobal(names: string[]): Promise<CatalogRow[]> {
  if (names.length === 0) return [];
  const cardRows: CatalogRow[] = [];
  const CHUNK = 100;
  for (let i = 0; i < names.length; i += CHUNK) {
    const slice = names.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('cards')
      .select(SELECT_GLOBAL)
      .eq('lang', LANG)
      .in('name', slice);
    if (error) {
      throw new Error(`cards global by name failed: ${error.message}`);
    }
    cardRows.push(...((data ?? []) as CatalogRow[]));
  }
  // Filter out junk layouts before we waste a sets join on them.
  const filtered = cardRows.filter(
    (r) => !r.layout || !SKIP_LAYOUTS.has(r.layout)
  );
  // Annotate each row with its set_type so preferPrintGlobal can
  // bias toward canonical reprints.
  const setCodes = Array.from(new Set(filtered.map((r) => r.set_code)));
  const setTypeMap = await fetchSetTypes(setCodes);
  for (const r of filtered) {
    (r as CatalogRow & { set_type?: string }).set_type =
      setTypeMap.get(r.set_code) ?? 'unknown';
  }
  return filtered;
}

async function fetchSetTypes(codes: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (codes.length === 0) return out;
  const CHUNK = 200;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const slice = codes.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('sets')
      .select('code, set_type')
      .in('code', slice);
    if (error) throw new Error(`sets by code failed: ${error.message}`);
    for (const row of data ?? []) {
      out.set((row as { code: string }).code, (row as { set_type: string }).set_type);
    }
  }
  return out;
}

/**
 * Compare two prints when picking a "global representative" of a
 * card name. The contemporary canonical reprint wins over Secret
 * Lair / promo / memorabilia art; among canonicals, the most-recent
 * release wins because that's the print competitive players see.
 */
function preferPrintGlobal(candidate: CatalogRow, current: CatalogRow): boolean {
  const cType = (candidate as CatalogRow & { set_type?: string }).set_type;
  const eType = (current as CatalogRow & { set_type?: string }).set_type;
  const cCanonical = cType ? CANONICAL_SET_TYPES.has(cType) : false;
  const eCanonical = eType ? CANONICAL_SET_TYPES.has(eType) : false;
  if (cCanonical !== eCanonical) return cCanonical;
  const cReleased = candidate.released_at ?? '';
  const eReleased = current.released_at ?? '';
  if (cReleased !== eReleased) return cReleased > eReleased;
  // Tie-break with the same numeric-collector-number heuristic so a
  // main-set print beats a promo collector slot inside the same set.
  return preferPrint(candidate, current);
}

/**
 * Per-front LIKE query so split / DFC cards resolve. We can't batch
 * many LIKE patterns into one PostgREST `or` clause cleanly because
 * card names contain commas and operators, so we run one query per
 * front. Volumes are small (≤ 5 unmatched fronts per set per run).
 */
async function fetchBySetAndDfcFronts(
  set: string,
  fronts: string[]
): Promise<CatalogRow[]> {
  if (fronts.length === 0) return [];
  const out: CatalogRow[] = [];
  for (const front of fronts) {
    // PostgREST's like uses % as wildcard. Escape % / _ in the front
    // (rare in Magic names but safe to handle).
    const escaped = front.replace(/[\\%_]/g, (m) => `\\${m}`);
    const { data, error } = await supabase
      .from('cards')
      .select(SELECT)
      .eq('set_code', set)
      .eq('lang', LANG)
      .like('name', `${escaped} //%`);
    if (error) {
      throw new Error(`cards ${set} dfc by front failed: ${error.message}`);
    }
    out.push(...((data ?? []) as CatalogRow[]));
  }
  return out;
}
