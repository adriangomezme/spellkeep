/**
 * Maps a Scryfall card JSON object to the shape of our `cards` table row.
 * Handles double-faced cards by preferring the front face for fields that
 * live on both faces (mana_cost, oracle_text, power/toughness, images).
 */
export function mapScryfallCard(card: any, now: string): Record<string, unknown> {
  const faces = card.card_faces;
  const mainFace = faces?.[0] ?? card;

  return {
    scryfall_id: card.id,
    oracle_id: card.oracle_id ?? faces?.[0]?.oracle_id ?? null,
    name: card.name,
    mana_cost: mainFace.mana_cost ?? card.mana_cost ?? null,
    cmc: card.cmc ?? 0,
    type_line: card.type_line ?? mainFace.type_line ?? null,
    oracle_text: mainFace.oracle_text ?? card.oracle_text ?? null,
    colors: card.colors ?? mainFace.colors ?? [],
    color_identity: card.color_identity ?? [],
    keywords: card.keywords ?? [],
    power: mainFace.power ?? card.power ?? null,
    toughness: mainFace.toughness ?? card.toughness ?? null,
    loyalty: mainFace.loyalty ?? card.loyalty ?? null,
    rarity: card.rarity,
    set_code: card.set,
    set_name: card.set_name,
    collector_number: card.collector_number,
    lang: card.lang ?? 'en',
    image_uri_small: card.image_uris?.small ?? faces?.[0]?.image_uris?.small ?? null,
    image_uri_normal: card.image_uris?.normal ?? faces?.[0]?.image_uris?.normal ?? null,
    image_uri_large: card.image_uris?.large ?? faces?.[0]?.image_uris?.large ?? null,
    image_uri_art_crop: card.image_uris?.art_crop ?? faces?.[0]?.image_uris?.art_crop ?? null,
    price_usd: card.prices?.usd ? parseFloat(card.prices.usd) : null,
    price_usd_foil: card.prices?.usd_foil ? parseFloat(card.prices.usd_foil) : null,
    price_usd_etched: card.prices?.usd_etched ? parseFloat(card.prices.usd_etched) : null,
    price_eur: card.prices?.eur ? parseFloat(card.prices.eur) : null,
    price_eur_foil: card.prices?.eur_foil ? parseFloat(card.prices.eur_foil) : null,
    legalities: card.legalities ?? {},
    released_at: card.released_at ?? null,
    artist: card.artist ?? null,
    is_legendary: (card.type_line ?? '').includes('Legendary'),
    produced_mana: card.produced_mana ?? [],
    layout: card.layout,
    card_faces: faces ?? null,
    edhrec_rank: card.edhrec_rank ?? null,
    illustration_id: card.illustration_id ?? faces?.[0]?.illustration_id ?? null,
    flavor_text: card.flavor_text ?? faces?.[0]?.flavor_text ?? null,
    updated_at: now,
  };
}

export function mapScryfallSet(set: any, now: string): Record<string, unknown> {
  return {
    scryfall_id: set.id,
    code: set.code,
    name: set.name,
    set_type: set.set_type,
    released_at: set.released_at ?? null,
    card_count: set.card_count ?? 0,
    icon_svg_uri: set.icon_svg_uri ?? null,
    updated_at: now,
  };
}
