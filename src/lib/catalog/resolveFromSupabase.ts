import { supabase } from '../supabase';
import { getPriceOverride } from '../pricing/priceOverrides';
import type { ScryfallCard } from '../scryfall';

// ─────────────────────────────────────────────────────────────────────────
// Fallback path when the local catalog.db snapshot is missing a card.
//
// The snapshot rebuilds daily. Any card inserted into Supabase `cards`
// between the last snapshot and "now" won't be in the local file yet, so
// `batchResolveBySupabaseId` returns empty for those UUIDs. That happens
// for e.g. freshly-imported Japanese Secret Lair printings the same day
// they land.
//
// This helper hits Supabase directly for the missing UUIDs and returns
// ScryfallCard-shaped rows — shape-compatible with the catalog path so
// the hook can merge them into its cache transparently.
// ─────────────────────────────────────────────────────────────────────────

const SELECT = `
  id, scryfall_id, oracle_id, name, mana_cost, cmc, type_line,
  colors, color_identity, keywords, rarity, set_code, set_name,
  collector_number, image_uri_small, image_uri_normal, image_uri_large,
  image_uri_art_crop, price_usd, price_usd_foil, price_eur, price_eur_foil,
  released_at, artist, layout, card_faces
`;

const CHUNK = 200;

export async function resolveCardsBySupabaseId(
  ids: string[]
): Promise<Map<string, ScryfallCard>> {
  const out = new Map<string, ScryfallCard>();
  if (ids.length === 0) return out;

  const unique = Array.from(new Set(ids));
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('cards')
      .select(SELECT)
      .in('id', slice);
    if (error) {
      console.warn('[resolveCardsBySupabaseId] fetch failed', error.message);
      continue;
    }
    for (const row of data ?? []) {
      const card = mapRow(row as any);
      if (card && (row as any).id) out.set((row as any).id, card);
    }
  }
  return out;
}

function mapRow(row: any): ScryfallCard | null {
  if (!row || !row.scryfall_id) return null;
  const override = getPriceOverride(row.scryfall_id);
  const priceUsd = override ? override.price_usd : (row.price_usd ?? null);
  const priceUsdFoil = override ? override.price_usd_foil : (row.price_usd_foil ?? null);
  return {
    id: row.scryfall_id,
    oracle_id: row.oracle_id ?? '',
    name: row.name,
    mana_cost: row.mana_cost ?? undefined,
    cmc: row.cmc ?? 0,
    type_line: row.type_line ?? '',
    colors: Array.isArray(row.colors) ? row.colors : undefined,
    color_identity: Array.isArray(row.color_identity) ? row.color_identity : [],
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    rarity: row.rarity ?? '',
    set: row.set_code ?? '',
    set_name: row.set_name ?? '',
    collector_number: row.collector_number ?? '',
    image_uris: row.image_uri_small
      ? {
          small: row.image_uri_small,
          normal: row.image_uri_normal ?? row.image_uri_small,
          large: row.image_uri_large ?? row.image_uri_normal ?? row.image_uri_small,
          art_crop: row.image_uri_art_crop ?? row.image_uri_normal ?? row.image_uri_small,
        }
      : undefined,
    card_faces: row.card_faces ?? undefined,
    artist: row.artist ?? undefined,
    prices: {
      usd: priceUsd != null ? String(priceUsd) : undefined,
      usd_foil: priceUsdFoil != null ? String(priceUsdFoil) : undefined,
      eur: row.price_eur != null ? String(row.price_eur) : undefined,
      eur_foil: row.price_eur_foil != null ? String(row.price_eur_foil) : undefined,
    },
    legalities: {},
    released_at: row.released_at ?? '',
    layout: row.layout ?? '',
  };
}
