/**
 * Maps a Scryfall `type_line` to the deck-detail display category.
 * Sideboard rows always go to `sideboard` regardless of type, so this
 * function only handles mainboard categorization.
 *
 * Order matters: lands win over creatures (a "Creature Land" prints
 * as `Land — Forest // Creature ...` but should group with lands),
 * creatures win over artifacts/enchantments (an "Artifact Creature"
 * goes to creatures), and so on. The Decks tab in many MTG apps
 * follows this same precedence.
 */
export type Category =
  | 'creatures'
  | 'planeswalkers'
  | 'spells'
  | 'artifacts'
  | 'enchantments'
  | 'battles'
  | 'lands';

export function typeLineToCategory(typeLine: string | null | undefined): Category {
  const t = (typeLine ?? '').toLowerCase();
  // Land first — even creature-lands belong with the mana base.
  if (t.includes('land')) return 'lands';
  if (t.includes('creature')) return 'creatures';
  if (t.includes('planeswalker')) return 'planeswalkers';
  if (t.includes('battle')) return 'battles';
  // Instant / sorcery → spells (the "non-permanent spell" bucket).
  if (t.includes('instant') || t.includes('sorcery')) return 'spells';
  if (t.includes('artifact')) return 'artifacts';
  if (t.includes('enchantment')) return 'enchantments';
  // Tribal / kindred / unknown — bucket with spells so it doesn't get
  // dropped. Real-world meta decks shouldn't hit this path, but the
  // worker must never crash on a category lookup.
  return 'spells';
}
