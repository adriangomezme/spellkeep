import type { Ionicons } from '@expo/vector-icons';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export type QuickSearchChip = {
  id: string;
  label: string;
  /** Scryfall query the chip stages into the search input on tap.
   *  These are hand-curated shortcuts, NOT AI-generated — actual AI
   *  search lives in the AiSearchSheet next to this row. */
  query: string;
  icon: IoniconName;
  /** Override for the search's uniqueMode at tap time. Mechanic chips
   *  (counterspells, removal, ramp, …) want one row per oracle so
   *  the result feed reads as N distinct cards, not the same card
   *  repeated across every print. Land chips and play-the-cards
   *  chips intentionally leave it alone so collectors can browse
   *  every printing. */
  unique?: 'cards' | 'art';
};

export const QUICK_SEARCH_CHIPS: QuickSearchChip[] = [
  // Manabase first — most-searched category for any deckbuilder.
  // No unique override: collectors browsing lands want to see every
  // printing's art and price.
  { id: 'surveillands', label: 'Surveil lands', query: 'is:surveilland', icon: 'eye-outline' },
  { id: 'fetchlands', label: 'Fetchlands', query: 'is:fetchland', icon: 'layers-outline' },
  { id: 'shocklands', label: 'Shocklands', query: 'is:shockland', icon: 'flash-outline' },
  // Format / strategy flags. Game Changers spans many prints per
  // card; collapse to one row each.
  {
    id: 'gamechangers',
    label: 'Game Changers',
    query: 'is:gamechanger',
    icon: 'trophy-outline',
    unique: 'cards',
  },
  // Functional spell categories — all dedupe by oracle so the user
  // browses N mechanics rather than N×prints. Queries use exact-
  // phrase matches so we don't surface false positives like "you
  // can't draw a card" or "prevent damage".
  {
    id: 'card-draw',
    label: 'Card draw spells',
    query: 'o:"draw a card" -t:land cmc<=3 lang:en',
    icon: 'document-text-outline',
    unique: 'cards',
  },
  {
    id: 'counterspells',
    label: 'Counterspells',
    query: 't:instant o:"counter target spell" lang:en',
    icon: 'ban-outline',
    unique: 'cards',
  },
  {
    id: 'removal',
    label: 'Creature removal',
    query: '(o:"destroy target creature" or o:"exile target creature") cmc<=3 lang:en',
    icon: 'close-circle-outline',
    unique: 'cards',
  },
  {
    id: 'mana-ramp',
    label: 'Mana ramp',
    query: '(o:"add" o:"mana" or o:"search your library for a basic land") -t:land cmc<=3 lang:en',
    icon: 'leaf-outline',
    unique: 'cards',
  },
  // Tutors — explicit "non-land tutor" filter. Land-fetching ramp
  // (Cultivate, Rampant Growth, Crop Rotation, Three Visits,
  // Nature's Lore) lives under Mana Ramp already, so we strip them
  // here with `-o:"land card"`, `-o:"basic land"` and `-o:"Forest"`.
  // The Forest negation catches the green ramp pattern where the
  // tutor names the basic-land subtype directly (Three Visits =
  // "search your library for a Forest card").
  {
    id: 'tutors',
    label: 'Tutors',
    query:
      'o:"search your library for" -t:land -o:"land card" -o:"basic land" -o:"Forest" cmc<=3 lang:en',
    icon: 'search-outline',
    unique: 'cards',
  },
  {
    id: 'treasures',
    label: 'Treasure makers',
    query: 'o:"create" o:"treasure token" lang:en',
    icon: 'cash-outline',
    unique: 'cards',
  },
  // Format-anchored entry point. Browses ALL legendary creatures —
  // the user expects to see every variant's art (alternate frames
  // etc.) so we leave unique alone.
  { id: 'commanders', label: 'Legendary commanders', query: 'is:commander legal:commander', icon: 'ribbon-outline' },
];
