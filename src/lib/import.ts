import { searchCards, type ScryfallCard } from './scryfall';
import {
  batchResolveByPrint,
  findCardByName,
  isCatalogReady,
  type BatchKey,
} from './catalog/catalogQueries';
import { addToCollection, type Condition, type Finish } from './collection';

export type ImportFormat = 'spellkeep' | 'plain' | 'csv' | 'tcgplayer' | 'cardsphere' | 'deckbox';

type ParsedCard = {
  name: string;
  set_code?: string;
  collector_number?: string;
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

function parseTCGPlayer(text: string): ParsedCard[] {
  const cards: ParsedCard[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Format: {qty} {name} [{set_code}] {collector_number}
    const match = trimmed.match(/^(\d+)\s+(.+?)\s+\[(\w+)\]\s+(\S+)$/);
    if (match) {
      cards.push({
        name: match[2],
        set_code: match[3].toLowerCase(),
        collector_number: match[4].split('/')[0], // handle "170/274" format
        quantity: parseInt(match[1], 10),
        finish: 'normal',
        condition: 'NM',
      });
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

function parseCardsphere(text: string): ParsedCard[] {
  const rows = parseCSVLines(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const cards: ParsedCard[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = getCol(headers, row, 'Name');
    if (!name) continue;

    const qty = parseInt(getCol(headers, row, 'Tradelist Count') || '1', 10);
    const foil = getCol(headers, row, 'Foil');
    const etched = getCol(headers, row, 'Etched Foil');
    const edition = getCol(headers, row, 'Edition');

    cards.push({
      name,
      set_code: undefined, // Cardsphere uses full edition name, not code
      quantity: isNaN(qty) ? 1 : qty,
      finish: parseFinish(foil, etched),
      condition: 'NM',
    });
  }
  return cards;
}

function parseDeckbox(text: string): ParsedCard[] {
  const rows = parseCSVLines(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const cards: ParsedCard[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = getCol(headers, row, 'Name');
    if (!name) continue;

    const qty = parseInt(getCol(headers, row, 'Count') || '1', 10);
    const colNum = getCol(headers, row, 'Card Number');
    const foil = getCol(headers, row, 'Foil');
    const etched = getCol(headers, row, 'Etched Foil');

    cards.push({
      name,
      collector_number: colNum || undefined,
      quantity: isNaN(qty) ? 1 : qty,
      finish: parseFinish(foil, etched),
      condition: 'NM',
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

const PARSERS: Record<ImportFormat, (text: string) => ParsedCard[]> = {
  spellkeep: parseSpellKeep,
  plain: parsePlainText,
  csv: parseCSV,
  tcgplayer: parseTCGPlayer,
  cardsphere: parseCardsphere,
  deckbox: parseDeckbox,
};

// ── Resolver: find Scryfall card from parsed data ──

async function resolveCardViaApi(parsed: ParsedCard): Promise<ScryfallCard | null> {
  if (parsed.set_code && parsed.collector_number) {
    try {
      const result = await searchCards(`!"${parsed.name}" set:${parsed.set_code} cn:${parsed.collector_number}`, 1);
      if (result?.data?.[0]) return result.data[0];
    } catch {}
  }

  if (parsed.set_code) {
    try {
      const result = await searchCards(`!"${parsed.name}" set:${parsed.set_code}`, 1);
      if (result?.data?.[0]) return result.data[0];
    } catch {}
  }

  try {
    const result = await searchCards(`!"${parsed.name}"`, 1);
    if (result?.data?.[0]) return result.data[0];
  } catch {}

  return null;
}

// ── Main import function ──

export type ImportResult = {
  total: number;
  imported: number;
  failed: string[];
};

export async function importToCollection(
  text: string,
  format: ImportFormat,
  collectionId: string,
  onProgress?: (current: number, total: number) => void,
): Promise<ImportResult> {
  const parser = PARSERS[format];
  const parsed = parser(text);
  const result: ImportResult = { total: parsed.length, imported: 0, failed: [] };

  // Phase 1: pre-resolve everything we can from the local catalog in one pass.
  // This is the common case — imports from TCGPlayer/Deckbox/etc have set+cn
  // for most rows, and our local catalog has 100k+ printings. We should
  // resolve ~99% here with a few grouped SELECTs.
  const resolved = new Map<number, ScryfallCard>();
  if (await isCatalogReady()) {
    const withPrint: BatchKey[] = parsed
      .map((p, idx) => ({ idx, p }))
      .filter(({ p }) => p.set_code && p.collector_number)
      .map(({ idx, p }) => ({
        key: String(idx),
        setCode: p.set_code!,
        collectorNumber: p.collector_number!,
      }));

    const byPrint = await batchResolveByPrint(withPrint);
    for (const { key } of withPrint) {
      const hit = byPrint.get(key);
      if (hit) resolved.set(Number(key), hit);
    }

    // Fallback pass: name-only for rows we didn't hit by print.
    for (let i = 0; i < parsed.length; i++) {
      if (resolved.has(i)) continue;
      const p = parsed[i];
      const hit = await findCardByName(p.name);
      if (hit) resolved.set(i, hit);
    }
  }

  // Phase 2: iterate, resolving via API only for misses, and inserting.
  for (let i = 0; i < parsed.length; i++) {
    const card = parsed[i];
    onProgress?.(i + 1, parsed.length);

    try {
      let scryfallCard = resolved.get(i) ?? null;

      if (!scryfallCard) {
        // Unknown to local catalog — fall back to Scryfall API.
        // Rate limit between network calls only; local resolves are instant.
        if (i > 0) await new Promise((r) => setTimeout(r, 100));
        scryfallCard = await resolveCardViaApi(card);
      }

      if (!scryfallCard) {
        result.failed.push(card.name);
        continue;
      }

      await addToCollection(scryfallCard, card.condition, card.finish, card.quantity, collectionId);
      result.imported++;
    } catch {
      result.failed.push(card.name);
    }
  }

  return result;
}
