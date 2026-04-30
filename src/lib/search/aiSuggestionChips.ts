import type { Ionicons } from '@expo/vector-icons';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export type AiSuggestionChip = {
  id: string;
  label: string;
  /** Scryfall query the chip executes today. Phase 6 (AI search) will
   *  swap the action to a free-form prompt that the model translates
   *  into filters, but the chips themselves stay as the same
   *  discoverable, pre-cooked entry points. */
  query: string;
  icon: IoniconName;
};

export const AI_SUGGESTION_CHIPS: AiSuggestionChip[] = [
  // Manabase first — most-searched category for any deckbuilder.
  { id: 'surveillands', label: 'Surveil lands', query: 'is:surveilland', icon: 'eye-outline' },
  { id: 'fetchlands', label: 'Fetchlands', query: 'is:fetchland', icon: 'layers-outline' },
  { id: 'shocklands', label: 'Shocklands', query: 'is:shockland', icon: 'flash-outline' },
  // Format-flag chips — quick filters most players reach for often.
  { id: 'gamechangers', label: 'Game Changers', query: 'is:gamechanger', icon: 'trophy-outline' },
  // Functional spell categories. Queries use exact-phrase matches
  // ("draw a card", "counter target spell") so we don't surface
  // false positives like "you can't draw a card".
  {
    id: 'card-draw',
    label: 'Card draw spells',
    query: 'o:"draw a card" -t:land cmc<=3 lang:en',
    icon: 'document-text-outline',
  },
  {
    id: 'counterspells',
    label: 'Counterspells',
    query: 't:instant o:"counter target spell" lang:en',
    icon: 'ban-outline',
  },
  {
    id: 'removal',
    label: 'Creature removal',
    query: '(o:"destroy target creature" or o:"exile target creature") cmc<=3 lang:en',
    icon: 'close-circle-outline',
  },
  {
    id: 'mana-ramp',
    label: 'Mana ramp',
    query: '(o:"add" o:"mana" or o:"search your library for a basic land") -t:land cmc<=3 lang:en',
    icon: 'leaf-outline',
  },
  {
    id: 'tutors',
    label: 'Tutors',
    query: 'o:"search your library for" -t:land cmc<=3 lang:en',
    icon: 'search-outline',
  },
  {
    id: 'treasures',
    label: 'Treasure makers',
    query: 'o:"create" o:"treasure token" lang:en',
    icon: 'cash-outline',
  },
  // Format-anchored entry points kept at the tail.
  { id: 'commanders', label: 'Legendary commanders', query: 'is:commander legal:commander', icon: 'ribbon-outline' },
  { id: 'reserved-cheap', label: 'Reserved list under $20', query: 'is:reserved usd<=20', icon: 'pricetag-outline' },
  { id: 'standard-budget', label: 'Standard budget rares', query: 'legal:standard r:rare usd<=2', icon: 'pricetag-outline' },
];
