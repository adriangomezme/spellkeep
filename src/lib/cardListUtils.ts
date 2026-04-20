import type { SortOption } from '../components/collection/SortSheet';
import type { FilterState, SetInfo } from '../components/collection/FilterSheet';

/**
 * Shared card entry shape used by binder detail and owned cards screens.
 * Both screens must include `added_at` and `cards.cmc` in their queries.
 */
export type CardEntry = {
  id: string;
  added_at: string;
  quantity_normal: number;
  quantity_foil: number;
  quantity_etched: number;
  cards: {
    name: string;
    set_name: string;
    set_code: string;
    collector_number: string;
    rarity: string;
    type_line: string;
    cmc: number | null;
    is_legendary: number | null;
    price_usd: number | null;
    price_usd_foil: number | null;
    price_usd_etched: number | null;
    color_identity: string[];
  };
};

/**
 * Price to show on a list/grid row, picked from the right finish:
 *   normal → price_usd
 *   foil   → price_usd_foil
 *   etched → price_usd_etched  (falls back to price_usd_foil if the
 *                               catalog only knows the foil number)
 * When a row carries multiple finishes we surface the max so the visible
 * number matches the most valuable copy the user owns. Returns null when
 * the row has no finish with a known price — the caller renders '—'.
 */
export function displayPriceForRow(
  qtyNormal: number,
  qtyFoil: number,
  qtyEtched: number,
  priceUsd: number | null | undefined,
  priceUsdFoil: number | null | undefined,
  priceUsdEtched: number | null | undefined
): number | null {
  const candidates: number[] = [];
  if (qtyNormal > 0 && typeof priceUsd === 'number') candidates.push(priceUsd);
  if (qtyFoil > 0 && typeof priceUsdFoil === 'number') candidates.push(priceUsdFoil);
  if (qtyEtched > 0) {
    if (typeof priceUsdEtched === 'number') candidates.push(priceUsdEtched);
    else if (typeof priceUsdFoil === 'number') candidates.push(priceUsdFoil);
  }
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

const RARITY_ORDER: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  mythic: 3,
  special: 4,
  bonus: 5,
};

const COLOR_ORDER: Record<string, number> = {
  W: 0, U: 1, B: 2, R: 3, G: 4,
};

function colorSortKey(colors: string[]): number {
  if (!colors || colors.length === 0) return 99;
  if (colors.length > 1) return 50 + colors.length;
  return COLOR_ORDER[colors[0]] ?? 10;
}

function parseColorIdentity(ci: string[] | string | null): string[] {
  if (!ci) return [];
  if (typeof ci === 'string') {
    try { return JSON.parse(ci); } catch { return []; }
  }
  return ci;
}

/**
 * Derive available sets from the card entries for the filter UI.
 */
export function deriveAvailableSets<T extends CardEntry>(entries: T[]): SetInfo[] {
  const map = new Map<string, { name: string; count: number }>();
  for (const e of entries) {
    const card = e.cards;
    if (!card) continue;
    const existing = map.get(card.set_code);
    if (existing) {
      existing.count++;
    } else {
      map.set(card.set_code, { name: card.set_name, count: 1 });
    }
  }
  return Array.from(map.entries())
    .map(([code, { name, count }]) => ({ code, name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function filterAndSort<T extends CardEntry>(
  entries: T[],
  searchQuery: string,
  sortBy: SortOption,
  ascending: boolean,
  filters: FilterState,
): T[] {
  let result = entries;

  // Search filter
  const q = searchQuery.trim().toLowerCase();
  if (q) {
    result = result.filter((e) => {
      const card = e.cards;
      return (
        card.name.toLowerCase().includes(q) ||
        card.set_name.toLowerCase().includes(q) ||
        card.set_code.toLowerCase().includes(q) ||
        card.type_line.toLowerCase().includes(q) ||
        card.collector_number.toLowerCase().includes(q)
      );
    });
  }

  // Filters
  if (filters.colors.length > 0) {
    result = result.filter((e) => {
      const ci = parseColorIdentity(e.cards.color_identity);
      if (filters.colors.includes('C')) {
        if (ci.length === 0) return true;
      }
      return filters.colors.some((c) => c !== 'C' && ci.includes(c));
    });
  }

  if (filters.rarity.length > 0) {
    result = result.filter((e) => filters.rarity.includes(e.cards.rarity));
  }

  if (filters.types.length > 0) {
    result = result.filter((e) => {
      const tl = e.cards.type_line.toLowerCase();
      return filters.types.some((t) => tl.includes(t.toLowerCase()));
    });
  }

  if (filters.manaValue.length > 0) {
    result = result.filter((e) => {
      const cmc = e.cards.cmc ?? 0;
      return filters.manaValue.some((m) => {
        if (m === '7+') return cmc >= 7;
        return cmc === parseInt(m, 10);
      });
    });
  }

  if (filters.isLegendary !== null) {
    result = result.filter((e) => {
      const isLeg = e.cards.is_legendary === 1;
      return filters.isLegendary ? isLeg : !isLeg;
    });
  }

  if (filters.priceValue.trim()) {
    const threshold = parseFloat(filters.priceValue);
    if (!isNaN(threshold)) {
      result = result.filter((e) => {
        const price = e.cards.price_usd ?? 0;
        return filters.priceMode === 'gte' ? price >= threshold : price <= threshold;
      });
    }
  }

  if (filters.sets.length > 0) {
    result = result.filter((e) => filters.sets.includes(e.cards.set_code));
  }

  // Sort
  const sorted = [...result].sort((a, b) => {
    const ca = a.cards;
    const cb = b.cards;
    let cmp = 0;

    switch (sortBy) {
      case 'added':
        cmp = (a.added_at ?? '').localeCompare(b.added_at ?? '');
        break;
      case 'name':
        cmp = ca.name.localeCompare(cb.name);
        break;
      case 'mana_value':
        cmp = (ca.cmc ?? 0) - (cb.cmc ?? 0);
        break;
      case 'price': {
        // Sort by the SAME price the row displays — otherwise a foil-only
        // printing with a valuable price_usd_foil falls to the bottom
        // because its price_usd is null. Matches displayPriceForRow's
        // finish resolution.
        const pa = displayPriceForRow(
          a.quantity_normal, a.quantity_foil, a.quantity_etched,
          ca.price_usd, ca.price_usd_foil, ca.price_usd_etched
        ) ?? 0;
        const pb = displayPriceForRow(
          b.quantity_normal, b.quantity_foil, b.quantity_etched,
          cb.price_usd, cb.price_usd_foil, cb.price_usd_etched
        ) ?? 0;
        cmp = pa - pb;
        break;
      }
      case 'color_identity':
        cmp = colorSortKey(parseColorIdentity(ca.color_identity)) - colorSortKey(parseColorIdentity(cb.color_identity));
        break;
      case 'rarity':
        cmp = (RARITY_ORDER[ca.rarity] ?? 0) - (RARITY_ORDER[cb.rarity] ?? 0);
        break;
      case 'collector_number': {
        const na = parseInt(ca.collector_number, 10) || 0;
        const nb = parseInt(cb.collector_number, 10) || 0;
        cmp = na - nb;
        break;
      }
      case 'set_code':
        cmp = ca.set_code.localeCompare(cb.set_code);
        break;
      case 'set_name':
        cmp = ca.set_name.localeCompare(cb.set_name);
        break;
    }

    return ascending ? cmp : -cmp;
  });

  return sorted;
}
