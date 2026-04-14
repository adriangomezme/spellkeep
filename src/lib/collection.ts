import { supabase } from './supabase';
import { ScryfallCard } from './scryfall';

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

/**
 * Ensures a card exists in the cards table before adding to collection.
 * If the card came from Scryfall search, it might not be in our DB yet.
 */
async function ensureCardExists(card: ScryfallCard): Promise<string> {
  // Check if card already exists
  const { data: existing } = await supabase
    .from('cards')
    .select('id')
    .eq('scryfall_id', card.id)
    .single();

  if (existing) return existing.id;

  // Insert the card
  const mainFace = card.card_faces?.[0] ?? card;
  const { data: inserted, error } = await supabase
    .from('cards')
    .insert({
      scryfall_id: card.id,
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
      card_faces: card.card_faces ? JSON.stringify(card.card_faces) : null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to insert card: ${error.message}`);
  return inserted!.id;
}

/**
 * Get the user's default collection ID.
 */
async function getDefaultCollectionId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('collections')
    .select('id')
    .eq('user_id', user.id)
    .eq('type', 'collection')
    .single();

  if (error || !data) throw new Error('Default collection not found');
  return data.id;
}

/**
 * Add a card to the user's collection.
 */
export async function addToCollection(
  card: ScryfallCard,
  condition: Condition,
  finish: Finish,
  quantity: number
): Promise<void> {
  const cardId = await ensureCardExists(card);
  const collectionId = await getDefaultCollectionId();

  // Check if entry already exists for this card + condition
  const { data: existing } = await supabase
    .from('collection_cards')
    .select('id, quantity_normal, quantity_foil, quantity_etched')
    .eq('collection_id', collectionId)
    .eq('card_id', cardId)
    .eq('condition', condition)
    .single();

  if (existing) {
    // Update quantity for the specific finish
    const updates: Record<string, number> = {};
    if (finish === 'normal') updates.quantity_normal = existing.quantity_normal + quantity;
    if (finish === 'foil') updates.quantity_foil = existing.quantity_foil + quantity;
    if (finish === 'etched') updates.quantity_etched = existing.quantity_etched + quantity;

    const { error } = await supabase
      .from('collection_cards')
      .update(updates)
      .eq('id', existing.id);

    if (error) throw new Error(`Failed to update collection: ${error.message}`);
  } else {
    // Insert new entry
    const { error } = await supabase
      .from('collection_cards')
      .insert({
        collection_id: collectionId,
        card_id: cardId,
        condition,
        quantity_normal: finish === 'normal' ? quantity : 0,
        quantity_foil: finish === 'foil' ? quantity : 0,
        quantity_etched: finish === 'etched' ? quantity : 0,
      });

    if (error) throw new Error(`Failed to add to collection: ${error.message}`);
  }
}
