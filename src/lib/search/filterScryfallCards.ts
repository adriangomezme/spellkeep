import {
  matchColorSet,
  parseColors,
  parseColorIdentity,
} from '../cardListUtils';
import { pickAnyPrice, type ScryfallCard } from '../scryfall';
import type { FilterState } from '../../components/collection/FilterSheet';

/**
 * Apply the same FilterState shape we use in binder/list/owned to a
 * raw ScryfallCard list. Mirrors `filterAndSort` from cardListUtils
 * but bypasses the CardEntry wrapper since the set detail page never
 * touches collection_cards.
 *
 * Set / Language / Tags branches are intentionally omitted — they
 * have no meaning when browsing a single English set.
 */
export function filterScryfallCards(
  cards: ScryfallCard[],
  filters: FilterState
): ScryfallCard[] {
  let result = cards;

  if (filters.colors.length > 0) {
    result = result.filter((c) =>
      matchColorSet(parseColors(c.colors ?? []), filters.colors, filters.colorsMode)
    );
  }
  if (filters.colorIdentity.length > 0) {
    result = result.filter((c) =>
      matchColorSet(
        parseColorIdentity(c.color_identity ?? []),
        filters.colorIdentity,
        filters.colorIdentityMode,
      )
    );
  }

  if (filters.rarity.length > 0) {
    result = result.filter((c) => filters.rarity.includes(c.rarity));
  }

  if (filters.types.length > 0) {
    result = result.filter((c) => {
      const tl = c.type_line.toLowerCase();
      return filters.types.some((t) => tl.includes(t.toLowerCase()));
    });
  }

  if (filters.manaValue.length > 0) {
    result = result.filter((c) => {
      const cmc = c.cmc ?? 0;
      return filters.manaValue.some((m) => {
        if (m === '7+') return cmc >= 7;
        return cmc === parseInt(m, 10);
      });
    });
  }

  if (filters.isLegendary !== null) {
    result = result.filter((c) => {
      const isLeg = c.type_line.toLowerCase().includes('legendary');
      return filters.isLegendary ? isLeg : !isLeg;
    });
  }

  if (filters.priceValue.trim()) {
    const threshold = parseFloat(filters.priceValue);
    if (!isNaN(threshold)) {
      result = result.filter((c) => {
        const raw = pickAnyPrice(c);
        if (!raw) return false;
        const n = parseFloat(raw);
        if (!isFinite(n)) return false;
        return filters.priceMode === 'gte' ? n >= threshold : n <= threshold;
      });
    }
  }

  return result;
}
