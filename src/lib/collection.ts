import { supabase } from './supabase';
import { ScryfallCard } from './scryfall';
import { getDefaultBinderId } from './collections';
import { findSupabaseIdByScryfallId } from './catalog/catalogQueries';

export type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
export type Finish = 'normal' | 'foil' | 'etched';

export const CONDITIONS: { value: Condition; label: string }[] = [
  { value: 'NM', label: 'Near Mint' },
  { value: 'LP', label: 'Lightly Played' },
  { value: 'MP', label: 'Moderately Played' },
  { value: 'HP', label: 'Heavily Played' },
  { value: 'DMG', label: 'Damaged' },
];

export const FINISHES: { value: Finish; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'foil', label: 'Foil' },
  { value: 'etched', label: 'Etched Foil' },
];

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Ensures a card exists in the cards table before adding to collection.
 * Calls the ensure-card Edge Function which uses service_role to insert.
 *
 * Uses fetch with anon key instead of supabase.functions.invoke because
 * PowerSync generates ES256 JWTs which Edge Functions don't support.
 */
export async function ensureCardExists(card: ScryfallCard): Promise<string> {
  // Fast path: local catalog usually has this card. The snapshot ships the
  // Supabase `id` UUID so we can short-circuit the network entirely.
  const localId = await findSupabaseIdByScryfallId(card.id);
  if (localId) return localId;

  // Fallback: server lookup. Needed only for cards that landed in Scryfall
  // after our last catalog sync (rare — usually new set spoilers).
  const { data: existing } = await supabase
    .from('cards')
    .select('id')
    .eq('scryfall_id', card.id)
    .single();

  if (existing) return existing.id;

  // Build card data for insertion
  const mainFace = card.card_faces?.[0] ?? card;
  const cardData = {
    oracle_id: card.oracle_id,
    name: card.name,
    mana_cost: mainFace.mana_cost ?? card.mana_cost,
    cmc: card.cmc ?? 0,
    type_line: card.type_line ?? mainFace.type_line,
    oracle_text: mainFace.oracle_text ?? card.oracle_text,
    colors: card.colors ?? [],
    color_identity: card.color_identity ?? [],
    keywords: card.keywords ?? [],
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    rarity: card.rarity,
    set_code: card.set,
    set_name: card.set_name,
    collector_number: card.collector_number,
    image_uri_small: card.image_uris?.small ?? card.card_faces?.[0]?.image_uris?.small,
    image_uri_normal: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal,
    image_uri_large: card.image_uris?.large ?? card.card_faces?.[0]?.image_uris?.large,
    image_uri_art_crop: card.image_uris?.art_crop ?? card.card_faces?.[0]?.image_uris?.art_crop,
    price_usd: card.prices?.usd ? parseFloat(card.prices.usd) : null,
    price_usd_foil: card.prices?.usd_foil ? parseFloat(card.prices.usd_foil) : null,
    price_eur: card.prices?.eur ? parseFloat(card.prices.eur) : null,
    price_eur_foil: card.prices?.eur_foil ? parseFloat(card.prices.eur_foil) : null,
    legalities: card.legalities ?? {},
    released_at: card.released_at,
    artist: card.artist,
    is_legendary: (card.type_line ?? '').includes('Legendary'),
    produced_mana: card.produced_mana ?? [],
    layout: card.layout,
    card_faces: card.card_faces ?? null,
  };

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ensure-card`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ scryfall_id: card.id, card_data: cardData }),
  });

  const body = await res.json();

  if (!res.ok) throw new Error(`Failed to ensure card: ${body?.error ?? res.statusText}`);
  if (!body?.card_id) throw new Error('No card_id returned from ensure-card');
  return body.card_id;
}

/**
 * Add a card to a collection, binder, or list.
 * If collectionId is omitted, uses the user's default binder ("My Cards").
 *
 * `purchasePrice` is per-row and last-write-wins on merges.
 */
export async function addToCollection(
  card: ScryfallCard,
  condition: Condition,
  finish: Finish,
  quantity: number,
  collectionId?: string,
  purchasePrice?: number | null
): Promise<void> {
  const cardId = await ensureCardExists(card);
  const targetId = collectionId ?? await getDefaultBinderId();

  const { data: existing } = await supabase
    .from('collection_cards')
    .select('id, quantity_normal, quantity_foil, quantity_etched')
    .eq('collection_id', targetId)
    .eq('card_id', cardId)
    .eq('condition', condition)
    .eq('language', 'en')
    .single();

  if (existing) {
    const updates: Record<string, number | null> = {};
    if (finish === 'normal') updates.quantity_normal = existing.quantity_normal + quantity;
    if (finish === 'foil') updates.quantity_foil = existing.quantity_foil + quantity;
    if (finish === 'etched') updates.quantity_etched = existing.quantity_etched + quantity;
    if (purchasePrice != null) updates.purchase_price = purchasePrice;

    const { error } = await supabase
      .from('collection_cards')
      .update(updates)
      .eq('id', existing.id);

    if (error) throw new Error(`Failed to update collection: ${error.message}`);
  } else {
    const { error } = await supabase
      .from('collection_cards')
      .insert({
        collection_id: targetId,
        card_id: cardId,
        condition,
        language: 'en',
        quantity_normal: finish === 'normal' ? quantity : 0,
        quantity_foil: finish === 'foil' ? quantity : 0,
        quantity_etched: finish === 'etched' ? quantity : 0,
        purchase_price: purchasePrice ?? null,
      });

    if (error) throw new Error(`Failed to add to collection: ${error.message}`);
  }
}
