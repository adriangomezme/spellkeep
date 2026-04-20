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
  lang?: string | null;
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
  artist?: string | null;
}): string {
  const colorIdentity = typeof card.color_identity === 'string'
    ? safeParseArray(card.color_identity)
    : (card.color_identity ?? []);

  return JSON.stringify({
    id: card.scryfall_id,
    oracle_id: card.oracle_id ?? '',
    name: card.name,
    // Scryfall language of the print itself — lets downstream flows
    // (Add to collection) persist the right value on collection_cards
    // without the user having to pick it manually.
    lang: card.lang ?? undefined,
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
    artist: card.artist ?? undefined,
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

