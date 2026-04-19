import { supabase } from './supabase';
import type { ScryfallCard } from './scryfall';
import type { CollectionType } from './collections';
import type { Condition, Finish } from './collection';

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

export async function fetchCardExtras(scryfallId: string): Promise<CardExtras | null> {
  const cached = extrasCache.get(scryfallId);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('cards')
    .select('oracle_text, power, toughness, loyalty, legalities, keywords, flavor_text, artist, produced_mana')
    .eq('scryfall_id', scryfallId)
    .single();

  if (error || !data) return null;

  const extras: CardExtras = {
    oracle_text: data.oracle_text ?? undefined,
    power: data.power ?? undefined,
    toughness: data.toughness ?? undefined,
    loyalty: data.loyalty ?? undefined,
    legalities: data.legalities ?? undefined,
    keywords: data.keywords ?? undefined,
    flavor_text: data.flavor_text ?? undefined,
    artist: data.artist ?? undefined,
    produced_mana: data.produced_mana ?? undefined,
  };

  extrasCache.set(scryfallId, extras);
  return extras;
}

export async function fetchSetIcon(setCode: string): Promise<string | null> {
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
