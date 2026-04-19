import { getCard, searchCards, type ScryfallCard } from './scryfall';
import {
  batchResolveByPrint,
  batchResolveByName,
  batchResolveByScryfallId,
  batchSupabaseIdsByScryfallId,
  isCatalogReady,
  type BatchKey,
} from './catalog/catalogQueries';
import { supabase } from './supabase';
import { ensureCardExists } from './collection';
import type { Condition, Finish } from './collection';

export type ImportFormat = 'spellkeep' | 'plain' | 'csv' | 'hevault';

type ParsedCard = {
  name: string;
  // Scryfall ID when the source file provides it (e.g. HeVault exports). This
  // is the canonical unique key — it distinguishes language variants, art
  // variants, and foil/etched printings that share the same name+set+cn.
  scryfall_id?: string;
  set_code?: string;
  collector_number?: string;
  language?: string;
  quantity: number;
  finish: Finish;
  condition: Condition;
};

// ── Parsers ──

function parsePlainText(text: string): ParsedCard[] {
  const cards: ParsedCard[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const foil = trimmed.includes('*F*');
    const etched = trimmed.includes('*E*');
    const cleaned = trimmed.replace(/\s*\*[FE]\*\s*/g, '').trim();

    // Format: {qty} {name} ({set_code}) {collector_number}
    const match = cleaned.match(/^(\d+)\s+(.+?)\s+\((\w+)\)\s+(\S+)$/);
    if (match) {
      cards.push({
        name: match[2],
        set_code: match[3].toLowerCase(),
        collector_number: match[4],
        quantity: parseInt(match[1], 10),
        finish: etched ? 'etched' : foil ? 'foil' : 'normal',
        condition: 'NM',
      });
    } else {
      // Fallback: {qty} {name}
      const simple = cleaned.match(/^(\d+)\s+(.+)$/);
      if (simple) {
        cards.push({
          name: simple[2],
          quantity: parseInt(simple[1], 10),
          finish: etched ? 'etched' : foil ? 'foil' : 'normal',
          condition: 'NM',
        });
      }
    }
  }
  return cards;
}

function parseCSVLines(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  const fields: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      fields.push(current);
      current = '';
      if (fields.some((f) => f.trim())) rows.push(fields.splice(0));
      else fields.length = 0;
    } else {
      current += ch;
    }
  }
  fields.push(current);
  if (fields.some((f) => f.trim())) rows.push(fields);
  return rows;
}

function getCol(headers: string[], row: string[], ...names: string[]): string {
  for (const name of names) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim() === name.toLowerCase());
    if (idx >= 0 && idx < row.length) return row[idx].trim();
  }
  return '';
}

function parseCondition(raw: string): Condition {
  const lower = raw.toLowerCase().replace(/[_-]/g, ' ').trim();
  if (lower.includes('near') || lower === 'nm') return 'NM';
  if (lower.includes('light') || lower === 'lp') return 'LP';
  if (lower.includes('moder') || lower === 'mp') return 'MP';
  if (lower.includes('heav') || lower === 'hp') return 'HP';
  if (lower.includes('damage') || lower.includes('poor') || lower === 'dmg') return 'DMG';
  return 'NM';
}

function parseFinish(foilVal: string, etchedVal: string): Finish {
  if (etchedVal && etchedVal.toLowerCase() !== 'false' && etchedVal !== '') return 'etched';
  if (foilVal && foilVal.toLowerCase() !== 'false' && foilVal.toLowerCase() !== 'normal' && foilVal !== '') return 'foil';
  return 'normal';
}

function parseCSV(text: string): ParsedCard[] {
  const rows = parseCSVLines(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const cards: ParsedCard[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = getCol(headers, row, 'Name');
    if (!name) continue;

    const qty = parseInt(getCol(headers, row, 'Quantity', 'Count') || '1', 10);
    const setCode = getCol(headers, row, 'Set code', 'Edition');
    const colNum = getCol(headers, row, 'Collector number', 'Card Number');
    const foil = getCol(headers, row, 'Foil');
    const etched = getCol(headers, row, 'Etched Foil');
    const condition = getCol(headers, row, 'Condition');

    cards.push({
      name,
      set_code: setCode?.toLowerCase() || undefined,
      collector_number: colNum || undefined,
      quantity: isNaN(qty) ? 1 : qty,
      finish: parseFinish(foil, etched),
      condition: parseCondition(condition),
    });
  }
  return cards;
}

function parseSpellKeep(text: string): ParsedCard[] {
  const rows = parseCSVLines(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const cards: ParsedCard[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = getCol(headers, row, 'card_name');
    if (!name) continue;

    const qty = parseInt(getCol(headers, row, 'qty') || '1', 10);
    const code = getCol(headers, row, 'code');
    const printingId = getCol(headers, row, 'printing_id');
    const finish = getCol(headers, row, 'finish') as Finish || 'normal';

    cards.push({
      name,
      set_code: code?.toLowerCase() || undefined,
      collector_number: printingId || undefined,
      quantity: isNaN(qty) ? 1 : qty,
      finish: ['normal', 'foil', 'etched'].includes(finish) ? finish : 'normal',
      condition: 'NM',
    });
  }
  return cards;
}

// HeVault CSV export format. Columns observed:
//   cmc,collector_number,color_identity,colors,estimated_price,extras,
//   language,mana_cost,name,oracle_id,quantity,rarity,scryfall_id,
//   set_code,set_name,type_line
// The canonical unique key is `scryfall_id`; everything else is best-effort
// metadata. `extras` is the finish marker: "foil", "etchedFoil", or empty.
function parseHevault(text: string): ParsedCard[] {
  const rows = parseCSVLines(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const cards: ParsedCard[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const scryfallId = getCol(headers, row, 'scryfall_id');
    const name = getCol(headers, row, 'name');
    if (!scryfallId && !name) continue;

    const qty = parseInt(getCol(headers, row, 'quantity') || '1', 10);
    const setCode = getCol(headers, row, 'set_code');
    const colNum = getCol(headers, row, 'collector_number');
    const language = getCol(headers, row, 'language');
    const extras = getCol(headers, row, 'extras').toLowerCase();

    let finish: Finish = 'normal';
    if (extras === 'etchedfoil') finish = 'etched';
    else if (extras === 'foil') finish = 'foil';

    cards.push({
      name,
      scryfall_id: scryfallId || undefined,
      set_code: setCode?.toLowerCase() || undefined,
      collector_number: colNum || undefined,
      language: language || undefined,
      quantity: isNaN(qty) ? 1 : qty,
      finish,
      condition: 'NM',
    });
  }
  return cards;
}

const PARSERS: Record<ImportFormat, (text: string) => ParsedCard[]> = {
  spellkeep: parseSpellKeep,
  plain: parsePlainText,
  csv: parseCSV,
  hevault: parseHevault,
};

// ── Import engine ────────────────────────────────────────────────────────

export type ImportProgress = {
  phase: 'parsing' | 'resolving' | 'resolving_online' | 'uploading' | 'done';
  current: number;
  total: number;
};

export type ImportResult = {
  // Count of parsed source rows (lines in the CSV / text). Used by the
  // progress UI as the denominator.
  total: number;
  // Total card quantities added. `imported` counts the qty on rows that
  // didn't exist in the destination collection; `updated` counts the qty
  // delta applied to rows that did. Their sum = physical cards saved to
  // the binder. Switched from variant counts so the displayed number
  // matches what the user sees on the CSV.
  imported: number;
  updated: number;
  failed: string[];
};

// Collapse file rows that point at the same print and condition/finish before
// we even hit the catalog. Playsets, multi-list files etc. commonly repeat
// the same line — dedup here shaves both catalog and RPC work.
type ParsedKey = {
  groupKey: string;
  parsed: ParsedCard;
  // Running total for this (name/print, condition, finish) bucket.
  quantity: number;
};

function parsedKeyFor(p: ParsedCard): string {
  // scryfall_id is canonical when the source file provides it — it already
  // encodes language, art variant, and foil/etched distinctions. Dedupe on
  // (scryfall_id, condition, finish, language) so two rows for the same
  // printing get merged while language/etched variants stay separate. The
  // language bit is only load-bearing when multiple foreign-language rows
  // collapse onto the same English card_id server-side (rare fallback).
  const lang = (p.language ?? 'en').toLowerCase();
  if (p.scryfall_id) {
    return `sid:${p.scryfall_id}|${p.condition}|${p.finish}|${lang}`;
  }
  const set = p.set_code ?? '';
  const cn = p.collector_number ?? '';
  return `${p.name.toLowerCase()}|${set}|${cn}|${p.condition}|${p.finish}|${lang}`;
}

function dedupeParsed(parsed: ParsedCard[]): ParsedKey[] {
  const map = new Map<string, ParsedKey>();
  for (const p of parsed) {
    const key = parsedKeyFor(p);
    const existing = map.get(key);
    if (existing) {
      existing.quantity += p.quantity;
    } else {
      map.set(key, { groupKey: key, parsed: p, quantity: p.quantity });
    }
  }
  return Array.from(map.values());
}

// Rows ready to send to the RPC. `scryfall_id` and `card_id` are both known
// once resolution + supabase-id mapping finishes.
type ResolvedRow = {
  card_id: string;
  condition: Condition;
  language: string;
  quantity_normal: number;
  quantity_foil: number;
  quantity_etched: number;
};

// Chunk size for RPC payloads. Each row is small JSON (~120 bytes), so 2k
// rows ≈ 240 KB per request — comfortably under PostgREST's 1 MB limit and
// under the Edge/API statement timeout of 60s for a single upsert.
const RPC_CHUNK = 2000;

// Limits online-only resolution parallelism for cards missing from the local
// catalog. Keeps us under Scryfall's 10 req/s rate limit while avoiding
// purely serial waits.
const ONLINE_CONCURRENCY = 4;

// Minimum gap between Scryfall API requests (ms). Scryfall asks clients to
// cap at ~10 req/s; 120 ms * ONLINE_CONCURRENCY(4) = ~33 req/s worst case,
// but practically less because responses take 100-200 ms themselves. Without
// this throttle, DFC-heavy imports where the local catalog is stale were
// burst-hitting Scryfall and getting silently 429'd.
const SCRYFALL_MIN_GAP_MS = 120;
let lastScryfallAt = 0;

async function throttleScryfall(): Promise<void> {
  const now = Date.now();
  const wait = lastScryfallAt + SCRYFALL_MIN_GAP_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastScryfallAt = Date.now();
}

/**
 * Batch query Supabase directly for `scryfall_id → card_id` (Supabase UUID).
 * Used as the middle layer between the local catalog and the Scryfall API:
 * if the local snapshot is stale, Supabase still has the full card data —
 * we only need the primary key to complete the import, no remote fetch and
 * no chance of being rate-limited.
 */
async function fetchSupabaseCardIdsFromServer(
  scryfallIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (scryfallIds.length === 0) return result;

  const unique = Array.from(new Set(scryfallIds));
  const CHUNK = 500;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('cards')
      .select('id, scryfall_id')
      .in('scryfall_id', slice);
    if (error) continue; // soft-fail, falls through to Scryfall path
    for (const row of data ?? []) {
      if (row.scryfall_id && row.id) {
        result.set(row.scryfall_id as string, row.id as string);
      }
    }
  }
  return result;
}

async function resolveCardViaApi(parsed: ParsedCard): Promise<ScryfallCard | null> {
  // When the source file gives us a Scryfall ID, go straight to the single
  // authoritative endpoint. This is the only way to pull non-English / art
  // variants that aren't indexed by name+set+cn.
  if (parsed.scryfall_id) {
    try {
      await throttleScryfall();
      return await getCard(parsed.scryfall_id);
    } catch {
      return null;
    }
  }

  if (parsed.set_code && parsed.collector_number) {
    try {
      await throttleScryfall();
      const result = await searchCards(`!"${parsed.name}" set:${parsed.set_code} cn:${parsed.collector_number}`, 1);
      if (result?.data?.[0]) return result.data[0];
    } catch {}
  }

  if (parsed.set_code) {
    try {
      await throttleScryfall();
      const result = await searchCards(`!"${parsed.name}" set:${parsed.set_code}`, 1);
      if (result?.data?.[0]) return result.data[0];
    } catch {}
  }

  try {
    await throttleScryfall();
    const result = await searchCards(`!"${parsed.name}"`, 1);
    if (result?.data?.[0]) return result.data[0];
  } catch {}

  return null;
}

async function runInPool<T, R>(
  items: T[],
  worker: (item: T, idx: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function pump() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, pump);
  await Promise.all(workers);
  return results;
}

export async function importToCollection(
  text: string,
  format: ImportFormat,
  collectionId: string,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  const parser = PARSERS[format];
  const parsed = parser(text);
  const result: ImportResult = {
    total: parsed.length,
    imported: 0,
    updated: 0,
    failed: [],
  };
  if (parsed.length === 0) return result;

  onProgress?.({ phase: 'parsing', current: parsed.length, total: parsed.length });

  // 1. Dedupe file rows — multiple "4 Forest" lines collapse to one with qty=4
  // before we spend catalog / RPC work on them.
  const groups = dedupeParsed(parsed);

  // 2. Local catalog resolution (the fast path; 99%+ of real imports).
  //    Strategy is layered from most-specific to least:
  //    (a) scryfall_id exact match — canonical, handles language/art/etched
  //    (b) (set_code, collector_number) — handles plain-text imports
  //    (c) name-only — last-resort fallback
  const resolvedByGroup = new Map<string, ScryfallCard>();
  if (await isCatalogReady()) {
    const sidList = groups
      .filter((g) => g.parsed.scryfall_id)
      .map((g) => g.parsed.scryfall_id!);
    if (sidList.length > 0) {
      const bySid = await batchResolveByScryfallId(sidList);
      for (const g of groups) {
        const sid = g.parsed.scryfall_id;
        if (!sid) continue;
        const hit = bySid.get(sid);
        if (hit) resolvedByGroup.set(g.groupKey, hit);
      }
    }

    const printKeys: BatchKey[] = [];
    for (const g of groups) {
      if (resolvedByGroup.has(g.groupKey)) continue;
      // When the source row carries a scryfall_id, don't silently substitute
      // a different print with the same (set, collector_number). Two rows
      // can share set+cn but have distinct scryfall_ids (language variants,
      // art variants, etched foils) — substituting the wrong one would
      // create a "phantom" entry tagged with the foreign language but
      // pointing at the English card_id. Let the Supabase bridge and the
      // Scryfall API fallback handle it instead, or mark the row failed.
      if (g.parsed.scryfall_id) continue;
      if (g.parsed.set_code && g.parsed.collector_number) {
        printKeys.push({
          key: g.groupKey,
          setCode: g.parsed.set_code,
          collectorNumber: g.parsed.collector_number,
        });
      }
    }
    if (printKeys.length > 0) {
      const byPrint = await batchResolveByPrint(printKeys);
      for (const [key, card] of byPrint) resolvedByGroup.set(key, card);
    }

    const remainingNames = groups
      .filter((g) => !resolvedByGroup.has(g.groupKey) && !g.parsed.scryfall_id)
      .map((g) => g.parsed.name);
    if (remainingNames.length > 0) {
      const byName = await batchResolveByName(remainingNames);
      for (const g of groups) {
        if (resolvedByGroup.has(g.groupKey)) continue;
        if (g.parsed.scryfall_id) continue; // don't substitute a wrong print
        const hit = byName.get(g.parsed.name);
        if (hit) resolvedByGroup.set(g.groupKey, hit);
      }
    }
  }

  onProgress?.({ phase: 'resolving', current: resolvedByGroup.size, total: groups.length });

  // 3. Supabase bridge: for groups where we know the scryfall_id but the
  //    local catalog missed (stale snapshot), ask Supabase directly for the
  //    Supabase UUID. This avoids the previous behavior of falling all the
  //    way to the Scryfall REST API for cards we already have server-side,
  //    which was getting silently rate-limited and dropping ~60% of DFC /
  //    reversible imports.
  const supabaseIdMap = new Map<string, string>();

  // Start with the local-catalog-resolved cards (their UUID is already there).
  const localSids = Array.from(resolvedByGroup.values()).map((c) => c.id);
  if (localSids.length > 0) {
    const localIdMap = await batchSupabaseIdsByScryfallId(localSids);
    for (const [sid, uuid] of localIdMap) supabaseIdMap.set(sid, uuid);
  }

  // Now the server bridge for unresolved-but-scryfall-id-known groups.
  const missingSids = Array.from(
    new Set(
      groups
        .filter((g) => !resolvedByGroup.has(g.groupKey) && g.parsed.scryfall_id)
        .map((g) => g.parsed.scryfall_id!)
    )
  );
  if (missingSids.length > 0) {
    const serverIdMap = await fetchSupabaseCardIdsFromServer(missingSids);
    for (const [sid, uuid] of serverIdMap) supabaseIdMap.set(sid, uuid);
  }

  // 4. Online fallback: only for groups that are still unresolved AND not
  //    already covered by the Supabase bridge. These are genuinely new cards
  //    (spoilers that landed after the last catalog sync) or plain-text
  //    imports where the name wasn't in the catalog either.
  const unresolved = groups.filter((g) => {
    if (resolvedByGroup.has(g.groupKey)) return false;
    const sid = g.parsed.scryfall_id;
    if (sid && supabaseIdMap.has(sid)) return false;
    return true;
  });
  if (unresolved.length > 0) {
    let completed = 0;
    await runInPool(unresolved, async (g) => {
      const card = await resolveCardViaApi(g.parsed);
      if (card) resolvedByGroup.set(g.groupKey, card);
      completed++;
      if (completed % 25 === 0 || completed === unresolved.length) {
        onProgress?.({
          phase: 'resolving_online',
          current: completed,
          total: unresolved.length,
        });
      }
    }, ONLINE_CONCURRENCY);
  }

  // 5. Ensure-card for anything Supabase didn't have yet (brand-new cards
  //    that came from the Scryfall fallback in step 4).
  const needsEnsure: { groupKey: string; card: ScryfallCard }[] = [];
  for (const g of groups) {
    const card = resolvedByGroup.get(g.groupKey);
    if (!card) continue;
    if (!supabaseIdMap.has(card.id)) {
      needsEnsure.push({ groupKey: g.groupKey, card });
    }
  }

  if (needsEnsure.length > 0) {
    await runInPool(needsEnsure, async ({ card }) => {
      try {
        const id = await ensureCardExists(card);
        supabaseIdMap.set(card.id, id);
      } catch {
        // Silently skip; the group will end up in `failed` below when we
        // can't find its supabase_id.
      }
    }, ONLINE_CONCURRENCY);
  }

  // 6. Build RPC payload. Collapse per (card_id, condition) with per-finish
  //    quantity columns — this is the shape sp_bulk_upsert_collection_cards
  //    expects. For scryfall_id-keyed groups we may not have a full
  //    ScryfallCard (the Supabase bridge returns only the UUID), which is
  //    fine — the RPC only needs `card_id`.
  const rowMap = new Map<string, ResolvedRow>();
  for (const g of groups) {
    const scryfallCard = resolvedByGroup.get(g.groupKey);
    const sidForLookup = scryfallCard?.id ?? g.parsed.scryfall_id;
    const supabaseId = sidForLookup ? supabaseIdMap.get(sidForLookup) : undefined;
    if (!supabaseId) {
      for (let i = 0; i < g.quantity; i++) result.failed.push(g.parsed.name);
      continue;
    }

    const language = (g.parsed.language ?? 'en').toLowerCase();
    const rowKey = `${supabaseId}|${g.parsed.condition}|${language}`;
    const existing = rowMap.get(rowKey);
    const row = existing ?? {
      card_id: supabaseId,
      condition: g.parsed.condition,
      language,
      quantity_normal: 0,
      quantity_foil: 0,
      quantity_etched: 0,
    };
    if (g.parsed.finish === 'normal') row.quantity_normal += g.quantity;
    else if (g.parsed.finish === 'foil') row.quantity_foil += g.quantity;
    else row.quantity_etched += g.quantity;
    rowMap.set(rowKey, row);
  }

  const rows = Array.from(rowMap.values());

  // 6. Bulk upsert in chunks via the RPC. Each chunk is a single network
  // round-trip and a single SQL statement; 100k cards turns into ~50
  // requests instead of 300k.
  let uploaded = 0;
  for (let i = 0; i < rows.length; i += RPC_CHUNK) {
    const chunk = rows.slice(i, i + RPC_CHUNK);
    const { data, error } = await supabase.rpc('sp_bulk_upsert_collection_cards', {
      p_collection_id: collectionId,
      p_rows: chunk,
    });
    if (error) {
      throw new Error(`Bulk upsert failed: ${error.message}`);
    }
    const stats = Array.isArray(data) ? data[0] : data;
    if (stats) {
      result.imported += Number(stats.inserted ?? 0);
      result.updated += Number(stats.updated ?? 0);
    }
    uploaded += chunk.length;
    onProgress?.({ phase: 'uploading', current: uploaded, total: rows.length });
  }

  onProgress?.({ phase: 'done', current: rows.length, total: rows.length });
  return result;
}
