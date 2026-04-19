import { supabase } from './supabase';
import type { Condition } from './collection';

type ExportCard = {
  name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  scryfall_id: string;
  oracle_id: string;
  rarity: string;
  type_line: string;
  mana_cost: string;
  cmc: number;
  colors: string;
  is_legendary: boolean;
  layout: string;
  condition: Condition;
  quantity_normal: number;
  quantity_foil: number;
  quantity_etched: number;
};

export type ExportFormat = 'spellkeep' | 'csv' | 'plain';

const CONDITION_MAP: Record<string, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
};

async function fetchCollectionCards(collectionId: string): Promise<ExportCard[]> {
  const { data, error } = await supabase
    .from('collection_cards')
    .select(`
      condition, quantity_normal, quantity_foil, quantity_etched,
      cards (
        name, set_code, set_name, collector_number, scryfall_id, oracle_id,
        rarity, type_line, mana_cost, cmc, colors, is_legendary, layout
      )
    `)
    .eq('collection_id', collectionId);

  if (error) throw new Error(`Failed to fetch cards: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    name: row.cards.name,
    set_code: row.cards.set_code,
    set_name: row.cards.set_name,
    collector_number: row.cards.collector_number,
    scryfall_id: row.cards.scryfall_id,
    oracle_id: row.cards.oracle_id ?? '',
    rarity: row.cards.rarity,
    type_line: row.cards.type_line ?? '',
    mana_cost: row.cards.mana_cost ?? '',
    cmc: row.cards.cmc ?? 0,
    colors: row.cards.colors ?? '[]',
    is_legendary: !!row.cards.is_legendary,
    layout: row.cards.layout ?? 'normal',
    condition: row.condition,
    quantity_normal: row.quantity_normal,
    quantity_foil: row.quantity_foil,
    quantity_etched: row.quantity_etched,
  }));
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ── Format: SpellKeep CSV (proprietary) ──
function formatSpellKeep(cards: ExportCard[]): string {
  const header = 'card_name,printing_id,code,set,scryfall_id,oracle_id,cmc,cost,card_type,card_rarity,colors,qty,finish,market_price_usd,lang,is_legendary,layout,spellkeep_version';
  const rows: string[] = [header];

  for (const c of cards) {
    const colorsStr = typeof c.colors === 'string' ? c.colors.replace(/[\[\]"]/g, '') : '';
    const price = ''; // market price TBD

    if (c.quantity_normal > 0) {
      rows.push(`${escapeCsv(c.name)},${c.collector_number},${c.set_code.toUpperCase()},${escapeCsv(c.set_name)},${c.scryfall_id},${c.oracle_id},${c.cmc},${escapeCsv(c.mana_cost)},${escapeCsv(c.type_line)},${c.rarity},${colorsStr},${c.quantity_normal},normal,${price},en,${c.is_legendary},${c.layout},1`);
    }
    if (c.quantity_foil > 0) {
      rows.push(`${escapeCsv(c.name)},${c.collector_number},${c.set_code.toUpperCase()},${escapeCsv(c.set_name)},${c.scryfall_id},${c.oracle_id},${c.cmc},${escapeCsv(c.mana_cost)},${escapeCsv(c.type_line)},${c.rarity},${colorsStr},${c.quantity_foil},foil,${price},en,${c.is_legendary},${c.layout},1`);
    }
    if (c.quantity_etched > 0) {
      rows.push(`${escapeCsv(c.name)},${c.collector_number},${c.set_code.toUpperCase()},${escapeCsv(c.set_name)},${c.scryfall_id},${c.oracle_id},${c.cmc},${escapeCsv(c.mana_cost)},${escapeCsv(c.type_line)},${c.rarity},${colorsStr},${c.quantity_etched},etched,${price},en,${c.is_legendary},${c.layout},1`);
    }
  }

  return rows.join('\n');
}

// ── Format: CSV (all properties) ──
function formatCSV(cards: ExportCard[]): string {
  const header = 'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,Scryfall ID,Condition,Language';
  const rows: string[] = [header];

  for (const c of cards) {
    if (c.quantity_normal > 0) {
      rows.push(`${escapeCsv(c.name)},${c.set_code.toUpperCase()},${escapeCsv(c.set_name)},${c.collector_number},normal,${c.rarity},${c.quantity_normal},${c.scryfall_id},${CONDITION_MAP[c.condition] ?? c.condition},en`);
    }
    if (c.quantity_foil > 0) {
      rows.push(`${escapeCsv(c.name)},${c.set_code.toUpperCase()},${escapeCsv(c.set_name)},${c.collector_number},foil,${c.rarity},${c.quantity_foil},${c.scryfall_id},${CONDITION_MAP[c.condition] ?? c.condition},en`);
    }
    if (c.quantity_etched > 0) {
      rows.push(`${escapeCsv(c.name)},${c.set_code.toUpperCase()},${escapeCsv(c.set_name)},${c.collector_number},etched,${c.rarity},${c.quantity_etched},${c.scryfall_id},${CONDITION_MAP[c.condition] ?? c.condition},en`);
    }
  }

  return rows.join('\n');
}

// ── Format: Plain Text ──
function formatPlainText(cards: ExportCard[]): string {
  const lines: string[] = [];

  for (const c of cards) {
    if (c.quantity_normal > 0) {
      lines.push(`${c.quantity_normal} ${c.name} (${c.set_code.toUpperCase()}) ${c.collector_number}`);
    }
    if (c.quantity_foil > 0) {
      lines.push(`${c.quantity_foil} ${c.name} (${c.set_code.toUpperCase()}) ${c.collector_number} *F*`);
    }
    if (c.quantity_etched > 0) {
      lines.push(`${c.quantity_etched} ${c.name} (${c.set_code.toUpperCase()}) ${c.collector_number} *E*`);
    }
  }

  return lines.join('\n');
}

const FORMATTERS: Record<ExportFormat, (cards: ExportCard[]) => string> = {
  spellkeep: formatSpellKeep,
  csv: formatCSV,
  plain: formatPlainText,
};

const FILE_EXTENSIONS: Record<ExportFormat, string> = {
  spellkeep: '.csv',
  csv: '.csv',
  plain: '.txt',
};

export async function exportCollection(
  collectionId: string,
  collectionName: string,
  format: ExportFormat,
): Promise<{ content: string; filename: string; mimeType: string }> {
  const cards = await fetchCollectionCards(collectionId);
  const formatter = FORMATTERS[format];
  const content = formatter(cards);
  const ext = FILE_EXTENSIONS[format];
  const sanitizedName = collectionName.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
  const filename = `${sanitizedName}${ext}`;
  const mimeType = ext === '.txt' ? 'text/plain' : 'text/csv';

  return { content, filename, mimeType };
}
