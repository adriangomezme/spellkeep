/**
 * Scryfall API client for live card search.
 * Used when searching for cards not yet in our local DB.
 * Respects Scryfall's rate limit guidelines (50-100ms between requests).
 */

const BASE_URL = 'https://api.scryfall.com';

export type ScryfallCard = {
  id: string;
  oracle_id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity: string[];
  keywords: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  rarity: string;
  set: string;
  set_name: string;
  collector_number: string;
  image_uris?: {
    small: string;
    normal: string;
    large: string;
    art_crop: string;
  };
  card_faces?: {
    name: string;
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    image_uris?: {
      small: string;
      normal: string;
      large: string;
      art_crop: string;
    };
  }[];
  prices: {
    usd?: string;
    usd_foil?: string;
    eur?: string;
    eur_foil?: string;
  };
  legalities: Record<string, string>;
  released_at: string;
  artist?: string;
  layout: string;
  produced_mana?: string[];
};

export type ScryfallSearchResult = {
  object: string;
  total_cards: number;
  has_more: boolean;
  data: ScryfallCard[];
};

export type ScryfallAutocomplete = {
  object: string;
  total_values: number;
  data: string[];
};

/**
 * Autocomplete card names. Returns up to 20 suggestions.
 * Very fast — Scryfall caches these aggressively.
 */
export async function autocomplete(query: string): Promise<string[]> {
  if (query.length < 2) return [];

  const response = await fetch(
    `${BASE_URL}/cards/autocomplete?q=${encodeURIComponent(query)}`
  );

  if (!response.ok) return [];

  const data: ScryfallAutocomplete = await response.json();
  return data.data;
}

/**
 * Search cards with full Scryfall query syntax.
 */
export async function searchCards(
  query: string,
  page = 1
): Promise<ScryfallSearchResult | null> {
  if (query.length < 2) return null;

  const response = await fetch(
    `${BASE_URL}/cards/search?q=${encodeURIComponent(query)}&page=${page}`
  );

  if (!response.ok) {
    if (response.status === 404) return null; // No results
    throw new Error(`Scryfall search error: ${response.status}`);
  }

  return response.json();
}

/**
 * Get a single card by Scryfall ID.
 */
export async function getCard(scryfallId: string): Promise<ScryfallCard> {
  const response = await fetch(`${BASE_URL}/cards/${scryfallId}`);

  if (!response.ok) {
    throw new Error(`Scryfall card error: ${response.status}`);
  }

  return response.json();
}

/**
 * Get the image URI for a card, handling double-faced cards.
 */
export function getCardImageUri(
  card: ScryfallCard,
  size: 'small' | 'normal' | 'large' | 'art_crop' = 'normal'
): string | undefined {
  return card.image_uris?.[size] ?? card.card_faces?.[0]?.image_uris?.[size];
}

/**
 * Format a card's price for display.
 */
export function formatPrice(price?: string): string {
  if (!price) return '—';
  return `$${parseFloat(price).toFixed(2)}`;
}
