import { supabase } from './supabase';
import type { ScryfallCard } from './scryfall';
import type { CollectionType } from './collections';
import type { Condition, Finish } from './collection';
import {
  findSetIconLocal,
  findSetIconsLocal,
  isCatalogReady,
} from './catalog/catalogQueries';

// ─────────────────────────────────────────────────────────────────────────
// On-demand card "extras" — the heavy fields we strip from the offline
// catalog snapshot (oracle text, legalities, P/T, flavor, etc). Fetched
// the first time the detail screen opens for a given card and merged into
// the already-rendered state. Offline: silently no-op.
// ─────────────────────────────────────────────────────────────────────────

export type CardExtras = Partial<
  Pick<
    ScryfallCard,
    | 'oracle_text'
    | 'power'
    | 'toughness'
    | 'loyalty'
    | 'legalities'
    | 'keywords'
    | 'flavor_text'
    | 'artist'
    | 'produced_mana'
  >
>;

const extrasCache = new Map<string, CardExtras>();

const SCRYFALL_BASE = 'https://api.scryfall.com';

export async function fetchCardExtras(scryfallId: string): Promise<CardExtras | null> {
  const cached = extrasCache.get(scryfallId);
  if (cached) return cached;

  // Primary source: our own cards table. Fast, no rate limits, covers
  // 99%+ of cards that already made it through the daily bulk sync.
  const { data, error } = await supabase
    .from('cards')
    .select(
      'oracle_text, power, toughness, loyalty, legalities, keywords, artist, produced_mana, flavor_text'
    )
    .eq('scryfall_id', scryfallId)
    .maybeSingle();

  if (!error && data) {
    const extras = toCardExtras(data);
    extrasCache.set(scryfallId, extras);
    return extras;
  }

  if (error) console.warn('[fetchCardExtras] supabase failed:', error.message);

  // Fallback: cards freshly spoiled after our last bulk sync won't be in
  // Supabase yet. Ask Scryfall directly. Cheap one-off call, no rate
  // limiting headache at this volume.
  try {
    const res = await fetch(`${SCRYFALL_BASE}/cards/${scryfallId}`);
    if (!res.ok) return null;
    const sc = (await res.json()) as Record<string, unknown>;
    const faces = (sc as any).card_faces as any[] | undefined;
    const front = faces?.[0];
    const extras: CardExtras = {
      oracle_text: (sc.oracle_text as string | undefined) ?? front?.oracle_text,
      power: (sc.power as string | undefined) ?? front?.power,
      toughness: (sc.toughness as string | undefined) ?? front?.toughness,
      loyalty: (sc.loyalty as string | undefined) ?? front?.loyalty,
      legalities: (sc.legalities as Record<string, string> | undefined) ?? undefined,
      keywords: (sc.keywords as string[] | undefined) ?? undefined,
      artist: (sc.artist as string | undefined) ?? undefined,
      produced_mana: (sc.produced_mana as string[] | undefined) ?? undefined,
      flavor_text: (sc.flavor_text as string | undefined) ?? front?.flavor_text,
    };
    extrasCache.set(scryfallId, extras);
    return extras;
  } catch (e) {
    console.warn('[fetchCardExtras] scryfall fallback failed:', e);
    return null;
  }
}

/**
 * Serializes a client-side card row (from PowerSync `cards` or any source
 * that has the same general shape) into the minimal ScryfallCard-compatible
 * payload the detail screen expects as `cardJson`.
 *
 * Including as many of the header fields as possible here — mana_cost, P/T,
 * loyalty — prevents the visible flash when the merged card arrives.
 */
export function serializeCardForNavigation(card: {
  scryfall_id: string;
  oracle_id?: string | null;
  name: string;
  mana_cost?: string | null;
  cmc?: number | null;
  type_line?: string | null;
  oracle_text?: string | null;
  power?: string | null;
  toughness?: string | null;
  loyalty?: string | null;
  set_code?: string | null;
  set_name?: string | null;
  collector_number?: string | null;
  rarity?: string | null;
  image_uri_small?: string | null;
  image_uri_normal?: string | null;
  price_usd?: number | string | null;
  price_usd_foil?: number | string | null;
  color_identity?: string[] | string | null;
  layout?: string | null;
  card_faces?: unknown;
}): string {
  const colorIdentity = typeof card.color_identity === 'string'
    ? safeParseArray(card.color_identity)
    : (card.color_identity ?? []);

  return JSON.stringify({
    id: card.scryfall_id,
    oracle_id: card.oracle_id ?? '',
    name: card.name,
    mana_cost: card.mana_cost ?? undefined,
    cmc: card.cmc ?? 0,
    type_line: card.type_line ?? '',
    oracle_text: card.oracle_text ?? undefined,
    power: card.power ?? undefined,
    toughness: card.toughness ?? undefined,
    loyalty: card.loyalty ?? undefined,
    rarity: card.rarity ?? '',
    set: card.set_code ?? '',
    set_name: card.set_name ?? '',
    collector_number: card.collector_number ?? '',
    image_uris: card.image_uri_small
      ? {
          small: card.image_uri_small,
          normal: card.image_uri_normal ?? card.image_uri_small,
        }
      : undefined,
    prices: {
      usd: card.price_usd != null ? String(card.price_usd) : undefined,
      usd_foil: card.price_usd_foil != null ? String(card.price_usd_foil) : undefined,
    },
    color_identity: colorIdentity,
    legalities: {},
    keywords: [],
    layout: card.layout ?? 'normal',
    card_faces: card.card_faces ?? undefined,
  });
}

function safeParseArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function toCardExtras(row: Record<string, unknown>): CardExtras {
  return {
    oracle_text: (row.oracle_text as string | null) ?? undefined,
    power: (row.power as string | null) ?? undefined,
    toughness: (row.toughness as string | null) ?? undefined,
    loyalty: (row.loyalty as string | null) ?? undefined,
    legalities: (row.legalities as Record<string, string> | null) ?? undefined,
    keywords: (row.keywords as string[] | null) ?? undefined,
    artist: (row.artist as string | null) ?? undefined,
    produced_mana: (row.produced_mana as string[] | null) ?? undefined,
    flavor_text: (row.flavor_text as string | null) ?? undefined,
  };
}

export async function fetchSetIcon(setCode: string): Promise<string | null> {
  // Local-first: the catalog.sets table carries every set's icon URI, so
  // the common case resolves synchronously against on-device SQLite.
  if (await isCatalogReady()) {
    const local = await findSetIconLocal(setCode);
    if (local) return local;
  }
  const { data } = await supabase
    .from('sets')
    .select('icon_svg_uri')
    .eq('code', setCode)
    .single();
  return data?.icon_svg_uri ?? null;
}

/** Fetch icon URIs for many set codes at once. */
export async function fetchSetIcons(codes: string[]): Promise<Record<string, string>> {
  if (codes.length === 0) return {};

  if (await isCatalogReady()) {
    const local = await findSetIconsLocal(codes);
    if (Object.keys(local).length === codes.length) return local;
    // Partial local hit: merge with a server fallback for the misses.
    const missing = codes.filter((c) => !local[c.toLowerCase()]);
    if (missing.length === 0) return local;
    const { data } = await supabase
      .from('sets')
      .select('code, icon_svg_uri')
      .in('code', Array.from(new Set(missing.map((c) => c.toLowerCase()))));
    const merged = { ...local };
    for (const r of (data ?? []) as any[]) {
      if (r.icon_svg_uri) merged[r.code.toLowerCase()] = r.icon_svg_uri;
    }
    return merged;
  }

  const unique = Array.from(new Set(codes.map((c) => c.toLowerCase())));
  const { data } = await supabase
    .from('sets')
    .select('code, icon_svg_uri')
    .in('code', unique);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as any[]) {
    if (r.icon_svg_uri) out[r.code.toLowerCase()] = r.icon_svg_uri;
  }
  return out;
}

/**
 * Returns a map of `scryfall_id → total qty owned` for every print of
 * the given oracle. Includes copies in any binder or list owned by
 * the current user.
 */
export async function fetchOwnedQtyByOracleId(oracleId: string): Promise<Record<string, number>> {
  const { data: cards } = await supabase
    .from('cards')
    .select('id, scryfall_id')
    .eq('oracle_id', oracleId);

  if (!cards || cards.length === 0) return {};

  const cardIds = cards.map((c: any) => c.id);
  const idToScryfall: Record<string, string> = {};
  for (const c of cards as any[]) idToScryfall[c.id] = c.scryfall_id;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};

  const { data: rows } = await supabase
    .from('collection_cards')
    .select(`
      card_id,
      quantity_normal,
      quantity_foil,
      quantity_etched,
      collections!inner ( user_id )
    `)
    .in('card_id', cardIds)
    .eq('collections.user_id', user.id);

  const out: Record<string, number> = {};
  for (const r of (rows ?? []) as any[]) {
    const sid = idToScryfall[r.card_id];
    if (!sid) continue;
    const qty = (r.quantity_normal ?? 0) + (r.quantity_foil ?? 0) + (r.quantity_etched ?? 0);
    out[sid] = (out[sid] ?? 0) + qty;
  }
  return out;
}

export type OwnershipEntry = {
  id: string;
  collection_id: string;
  collection_name: string;
  collection_type: CollectionType;
  collection_color: string | null;
  condition: Condition;
  quantity_normal: number;
  quantity_foil: number;
  quantity_etched: number;
  purchase_price: number | null;
};

const FINISH_COLUMN: Record<Finish, 'quantity_normal' | 'quantity_foil' | 'quantity_etched'> = {
  normal: 'quantity_normal',
  foil: 'quantity_foil',
  etched: 'quantity_etched',
};

/**
 * Adjust the quantity of a finish on an existing collection_cards row.
 * If all three finishes drop to 0, the row is deleted (DB constraint
 * requires sum > 0).
 */
export async function adjustOwnershipQuantity(
  entry: OwnershipEntry,
  finish: Finish,
  delta: number
): Promise<void> {
  const col = FINISH_COLUMN[finish];
  const current = entry[col];
  const next = Math.max(0, current + delta);

  const projected = {
    quantity_normal: entry.quantity_normal,
    quantity_foil: entry.quantity_foil,
    quantity_etched: entry.quantity_etched,
    [col]: next,
  };
  const total =
    projected.quantity_normal + projected.quantity_foil + projected.quantity_etched;

  if (total <= 0) {
    const { error } = await supabase
      .from('collection_cards')
      .delete()
      .eq('id', entry.id);
    if (error) throw new Error(`Failed to remove entry: ${error.message}`);
    return;
  }

  const { error } = await supabase
    .from('collection_cards')
    .update({ [col]: next })
    .eq('id', entry.id);
  if (error) throw new Error(`Failed to update quantity: ${error.message}`);
}

export type OwnershipSummary = {
  total: number;
  normal: number;
  foil: number;
  etched: number;
  entries: OwnershipEntry[];
};

/**
 * Fetch every collection_cards row that references the given Scryfall card,
 * joined with the parent collection's name/type/color. Returns aggregated
 * counts plus the per-collection breakdown.
 */
export async function fetchOwnershipByScryfallId(
  scryfallId: string
): Promise<OwnershipSummary> {
  const empty: OwnershipSummary = { total: 0, normal: 0, foil: 0, etched: 0, entries: [] };

  const { data: card } = await supabase
    .from('cards')
    .select('id')
    .eq('scryfall_id', scryfallId)
    .single();

  if (!card) return empty;

  const { data, error } = await supabase
    .from('collection_cards')
    .select(`
      id,
      condition,
      quantity_normal,
      quantity_foil,
      quantity_etched,
      purchase_price,
      collections (
        id, name, type, color, user_id
      )
    `)
    .eq('card_id', card.id);

  if (error || !data) return empty;

  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  const entries: OwnershipEntry[] = [];
  let total = 0;
  let normal = 0;
  let foil = 0;
  let etched = 0;

  for (const row of data as any[]) {
    const c = row.collections;
    if (!c || c.user_id !== userId) continue;

    entries.push({
      id: row.id,
      collection_id: c.id,
      collection_name: c.name,
      collection_type: c.type,
      collection_color: c.color ?? null,
      condition: row.condition,
      quantity_normal: row.quantity_normal ?? 0,
      quantity_foil: row.quantity_foil ?? 0,
      quantity_etched: row.quantity_etched ?? 0,
      purchase_price: row.purchase_price ?? null,
    });

    normal += row.quantity_normal ?? 0;
    foil += row.quantity_foil ?? 0;
    etched += row.quantity_etched ?? 0;
  }

  total = normal + foil + etched;

  // Sort: binders first, then alpha
  entries.sort((a, b) => {
    if (a.collection_type !== b.collection_type) {
      return a.collection_type === 'binder' ? -1 : 1;
    }
    return a.collection_name.localeCompare(b.collection_name);
  });

  return { total, normal, foil, etched, entries };
}
