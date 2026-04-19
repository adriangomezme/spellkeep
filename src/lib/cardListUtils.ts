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
    color_identity: string[];
  };
};

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
      case 'price':
        cmp = (ca.price_usd ?? 0) - (cb.price_usd ?? 0);
        break;
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
