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
  { id: 'fetchlands', label: 'Fetchlands', query: 'is:fetchland', icon: 'layers-outline' },
  { id: 'shocklands', label: 'Shocklands', query: 'is:shockland', icon: 'flash-outline' },
  { id: 'triomes', label: 'Triomes', query: 'is:triome', icon: 'color-palette-outline' },
  { id: 'gamechangers', label: 'Game Changers', query: 'is:gamechanger', icon: 'trophy-outline' },
  { id: 'cheap-burn', label: 'Cheap red burn', query: 'c:r o:damage cmc<=2 t:instant', icon: 'flame-outline' },
  { id: 'counterspells', label: 'Counterspells', query: 'o:counter t:instant legal:modern', icon: 'ban-outline' },
  { id: 'flying-mythics', label: 'Mythic flyers', query: 't:creature r:mythic keyword:flying', icon: 'sparkles-outline' },
  { id: 'card-draw', label: 'Card draw spells', query: 'o:"draw" -t:land cmc<=3', icon: 'document-text-outline' },
  { id: 'commanders', label: 'Legendary commanders', query: 'is:commander legal:commander', icon: 'ribbon-outline' },
  { id: 'reserved-cheap', label: 'Reserved list under $20', query: 'is:reserved usd<=20', icon: 'pricetag-outline' },
  { id: 'standard-budget', label: 'Standard budget rares', query: 'legal:standard r:rare usd<=2', icon: 'pricetag-outline' },
  { id: 'free-spells', label: 'Free spells', query: 'cmc=0 -t:land', icon: 'gift-outline' },
];
