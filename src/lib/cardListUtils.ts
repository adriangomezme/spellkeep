import type { SortOption } from '../components/collection/SortSheet';
import type { FilterState, SetInfo, TagFilterInfo } from '../components/collection/FilterSheet';

/**
 * Shared card entry shape used by binder detail and owned cards screens.
 * Both screens must include `added_at` and `cards.cmc` in their queries.
 */
export type CardEntry = {
  id: string;
  added_at: string;
  language?: string;
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

// Scryfall language codes the filter UI knows how to label. The map is
// intentionally small — anything outside it falls through to the code
// in uppercase so an unexpected language still renders usefully.
const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  ja: 'Japanese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ko: 'Korean',
  zhs: 'Chinese Simplified',
  zht: 'Chinese Traditional',
  ph: 'Phyrexian',
  ar: 'Arabic',
  he: 'Hebrew',
  la: 'Latin',
  grc: 'Ancient Greek',
  sa: 'Sanskrit',
};

export type LanguageInfo = {
  code: string;
  label: string;
  count: number;
};

/**
 * Derive available languages (+ counts) from the current card entries —
 * mirror of deriveAvailableSets so the filter UI can list exactly the
 * languages the user actually owns, sorted with English first, then the
 * rest alphabetically by label.
 */
export function deriveAvailableLanguages<T extends CardEntry>(entries: T[]): LanguageInfo[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    const code = (e.language ?? 'en').toLowerCase();
    map.set(code, (map.get(code) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([code, count]) => ({
      code,
      label: LANGUAGE_LABELS[code] ?? code.toUpperCase(),
      count,
    }))
    .sort((a, b) => {
      if (a.code === 'en') return -1;
      if (b.code === 'en') return 1;
      return a.label.localeCompare(b.label);
    });
}

/**
 * List of tags that appear on at least one of the given entries,
 * with per-tag entry counts. Returns empty when the catalog is empty
 * OR no entry carries any tag — callers should hide the Tags filter
 * tab in that case.
 */
export function deriveAvailableTags<T extends CardEntry>(
  entries: T[],
  tagsByEntryId: Map<string, string[]>,
  tagsCatalog: Array<{ id: string; name: string; color: string | null }>,
): TagFilterInfo[] {
  if (entries.length === 0 || tagsByEntryId.size === 0) return [];
  const counts = new Map<string, number>();
  for (const e of entries) {
    const ids = tagsByEntryId.get(e.id);
    if (!ids) continue;
    for (const id of ids) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return [];
  const byId = new Map(tagsCatalog.map((t) => [t.id, t]));
  const out: TagFilterInfo[] = [];
  for (const [id, count] of counts) {
    const meta = byId.get(id);
    if (!meta) continue;
    out.push({ id, name: meta.name, color: meta.color, count });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function filterAndSort<T extends CardEntry>(
  entries: T[],
  searchQuery: string,
  sortBy: SortOption,
  ascending: boolean,
  filters: FilterState,
  /** Optional id → tagIds map for the entries. Required when
   *  filters.tags is non-empty; otherwise the tag filter is a no-op. */
  tagsByEntryId?: Map<string, string[]>,
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

  if (filters.languages.length > 0) {
    result = result.filter((e) =>
      filters.languages.includes((e.language ?? 'en').toLowerCase())
    );
  }

  if (filters.tags.length > 0 && tagsByEntryId) {
    // Multi-select on tags is AND: an entry must carry every selected
    // tag to pass. Single-tag filter is the common case and falls
    // through quickly.
    const wanted = filters.tags;
    result = result.filter((e) => {
      const ids = tagsByEntryId.get(e.id);
      if (!ids || ids.length === 0) return false;
      return wanted.every((t) => ids.includes(t));
    });
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

// ─────────────────────────────────────────────────────────────────────────
// Group By — partitions a (filtered + sorted) entry list into Group[].
// Each group carries enough context (label, icon, accent color, subtotal)
// for the UI to render a header without re-deriving facts from raw rows.
// ─────────────────────────────────────────────────────────────────────────

export type GroupKind = 'rarity' | 'set' | 'color' | 'type' | 'tags';

export type GroupIcon =
  | { kind: 'rarity'; rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'bonus' }
  | {
      kind: 'type';
      type:
        | 'creature'
        | 'instant'
        | 'sorcery'
        | 'artifact'
        | 'enchantment'
        | 'land'
        | 'planeswalker'
        | 'battle'
        | 'multicolor';
    }
  | { kind: 'set'; setCode: string; svgUri?: string | null }
  | { kind: 'color'; color: 'W' | 'U' | 'B' | 'R' | 'G' | 'multi' | 'colorless' }
  | { kind: 'tag'; color: string | null }
  | { kind: 'none' };

export type Group<T> = {
  key: string;
  label: string;
  /** Optional secondary line (set release year, color identity hint, etc). */
  sublabel?: string;
  icon: GroupIcon;
  /** Optional brand tint the header can use as background or stripe. */
  accent?: string;
  entries: T[];
  cardCount: number;
  uniqueCount: number;
  /** USD subtotal for the group, or null when it doesn't apply
   *  (Color groupings hide the $ on purpose). */
  subtotal: number | null;
};

/** Optional metadata the grouping needs to render rich headers. */
export type GroupContext = {
  tagsByEntryId?: Map<string, string[]>;
  tagsCatalog?: Array<{ id: string; name: string; color: string | null }>;
  /** From the local `sets` table: name + released_at + icon_svg_uri. */
  setsMeta?: Map<
    string,
    { name: string; released_at: string | null; icon_svg_uri: string | null }
  >;
};

const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  mythic: 'Mythic Rare',
  special: 'Special',
  bonus: 'Bonus',
};

const RARITY_ACCENT: Record<string, string> = {
  common: '#1A1718',
  uncommon: '#707883',
  rare: '#A58E4A',
  mythic: '#BF4427',
  special: '#7B5BA8',
  bonus: '#7B5BA8',
};

const COLOR_LABEL: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  multi: 'Multicolor',
  colorless: 'Colorless',
};

const COLOR_ACCENT: Record<string, string> = {
  W: '#F9FAF4',
  U: '#0E68AB',
  B: '#150B00',
  R: '#D3202A',
  G: '#00733E',
  multi: '#E0C540',
  colorless: '#CCC2C0',
};

const COLOR_DISPLAY_ORDER: Record<string, number> = {
  W: 0,
  U: 1,
  B: 2,
  R: 3,
  G: 4,
  multi: 5,
  colorless: 6,
};

// Type buckets — ordered the way MTG players actually talk about them.
const TYPE_ORDER: Array<{ key: string; needle: string; label: string }> = [
  { key: 'creature', needle: 'creature', label: 'Creature' },
  { key: 'planeswalker', needle: 'planeswalker', label: 'Planeswalker' },
  { key: 'battle', needle: 'battle', label: 'Battle' },
  { key: 'artifact', needle: 'artifact', label: 'Artifact' },
  { key: 'enchantment', needle: 'enchantment', label: 'Enchantment' },
  { key: 'instant', needle: 'instant', label: 'Instant' },
  { key: 'sorcery', needle: 'sorcery', label: 'Sorcery' },
  { key: 'land', needle: 'land', label: 'Land' },
];

function entryColorBucket<T extends CardEntry>(e: T): string {
  const ci = parseColorIdentity(e.cards.color_identity);
  if (ci.length === 0) return 'colorless';
  if (ci.length > 1) return 'multi';
  return ci[0];
}

function entryTypeBucket<T extends CardEntry>(e: T): { key: string; label: string } {
  const tl = (e.cards.type_line ?? '').toLowerCase();
  for (const t of TYPE_ORDER) {
    if (tl.includes(t.needle)) return { key: t.key, label: t.label };
  }
  return { key: 'other', label: 'Other' };
}

function entrySubtotalUSD<T extends CardEntry>(e: T): number {
  const v = displayPriceForRow(
    e.quantity_normal,
    e.quantity_foil,
    e.quantity_etched,
    e.cards.price_usd,
    e.cards.price_usd_foil,
    e.cards.price_usd_etched,
  );
  if (v == null) return 0;
  const totalCopies =
    (e.quantity_normal ?? 0) +
    (e.quantity_foil ?? 0) +
    (e.quantity_etched ?? 0);
  return v * Math.max(1, totalCopies);
}

function entryTotalCopies<T extends CardEntry>(e: T): number {
  return (
    (e.quantity_normal ?? 0) +
    (e.quantity_foil ?? 0) +
    (e.quantity_etched ?? 0)
  );
}

function entryUniqueVariants<T extends CardEntry>(e: T): number {
  let n = 0;
  if ((e.quantity_normal ?? 0) > 0) n++;
  if ((e.quantity_foil ?? 0) > 0) n++;
  if ((e.quantity_etched ?? 0) > 0) n++;
  return n || 1;
}

/**
 * Partition `entries` into groups according to `kind`. Order of the
 * returned groups follows the canonical MTG mental model for each
 * key (rarity power, set release date DESC, WUBRG, type theme, tag
 * popularity). Inside each group the entries keep the order they had
 * coming in — callers should run `filterAndSort` first.
 */
export function groupEntries<T extends CardEntry>(
  entries: T[],
  kind: GroupKind,
  ctx: GroupContext = {},
): Group<T>[] {
  if (entries.length === 0) return [];

  switch (kind) {
    case 'rarity':
      return groupByRarity(entries);
    case 'set':
      return groupBySet(entries, ctx.setsMeta);
    case 'color':
      return groupByColor(entries);
    case 'type':
      return groupByType(entries);
    case 'tags':
      return groupByTags(entries, ctx.tagsByEntryId, ctx.tagsCatalog);
  }
}

function groupByRarity<T extends CardEntry>(entries: T[]): Group<T>[] {
  const buckets = new Map<string, T[]>();
  for (const e of entries) {
    const r = (e.cards.rarity ?? '').toLowerCase() || 'common';
    const arr = buckets.get(r) ?? [];
    arr.push(e);
    buckets.set(r, arr);
  }
  const out: Group<T>[] = [];
  const order = ['mythic', 'rare', 'uncommon', 'common', 'special', 'bonus'];
  for (const r of order) {
    const arr = buckets.get(r);
    if (!arr || arr.length === 0) continue;
    const rarityKey =
      r === 'special' ? 'bonus' : (r as 'common' | 'uncommon' | 'rare' | 'mythic' | 'bonus');
    out.push({
      key: `rarity:${r}`,
      label: RARITY_LABEL[r] ?? r,
      icon: { kind: 'rarity', rarity: rarityKey },
      accent: RARITY_ACCENT[r],
      entries: arr,
      cardCount: arr.reduce((s, e) => s + entryTotalCopies(e), 0),
      uniqueCount: arr.reduce((s, e) => s + entryUniqueVariants(e), 0),
      subtotal: arr.reduce((s, e) => s + entrySubtotalUSD(e), 0),
    });
  }
  return out;
}

function groupBySet<T extends CardEntry>(
  entries: T[],
  setsMeta?: GroupContext['setsMeta'],
): Group<T>[] {
  const buckets = new Map<string, T[]>();
  for (const e of entries) {
    const code = (e.cards.set_code ?? '').toLowerCase();
    const arr = buckets.get(code) ?? [];
    arr.push(e);
    buckets.set(code, arr);
  }
  const out: Group<T>[] = [];
  for (const [code, arr] of buckets) {
    const meta = setsMeta?.get(code);
    out.push({
      key: `set:${code}`,
      label: meta?.name ?? arr[0].cards.set_name ?? code.toUpperCase(),
      sublabel: meta?.released_at?.slice(0, 4),
      icon: { kind: 'set', setCode: code, svgUri: meta?.icon_svg_uri ?? null },
      entries: arr,
      cardCount: arr.reduce((s, e) => s + entryTotalCopies(e), 0),
      uniqueCount: arr.reduce((s, e) => s + entryUniqueVariants(e), 0),
      subtotal: arr.reduce((s, e) => s + entrySubtotalUSD(e), 0),
    });
  }
  // Most recent release first; missing dates sink to the bottom.
  out.sort((a, b) => {
    const ay = a.sublabel ?? '';
    const by = b.sublabel ?? '';
    if (ay && by) return by.localeCompare(ay);
    if (ay) return -1;
    if (by) return 1;
    return a.label.localeCompare(b.label);
  });
  return out;
}

function groupByColor<T extends CardEntry>(entries: T[]): Group<T>[] {
  const buckets = new Map<string, T[]>();
  for (const e of entries) {
    const k = entryColorBucket(e);
    const arr = buckets.get(k) ?? [];
    arr.push(e);
    buckets.set(k, arr);
  }
  const out: Group<T>[] = [];
  const keys = Array.from(buckets.keys()).sort(
    (a, b) => (COLOR_DISPLAY_ORDER[a] ?? 99) - (COLOR_DISPLAY_ORDER[b] ?? 99),
  );
  for (const k of keys) {
    const arr = buckets.get(k)!;
    out.push({
      key: `color:${k}`,
      label: COLOR_LABEL[k] ?? k,
      icon: { kind: 'color', color: k as 'W' | 'U' | 'B' | 'R' | 'G' | 'multi' | 'colorless' },
      accent: COLOR_ACCENT[k],
      entries: arr,
      cardCount: arr.reduce((s, e) => s + entryTotalCopies(e), 0),
      uniqueCount: arr.reduce((s, e) => s + entryUniqueVariants(e), 0),
      // Color subtotal omitted on purpose — price is uncorrelated.
      subtotal: null,
    });
  }
  return out;
}

function groupByType<T extends CardEntry>(entries: T[]): Group<T>[] {
  const buckets = new Map<string, { label: string; arr: T[] }>();
  for (const e of entries) {
    const t = entryTypeBucket(e);
    const slot = buckets.get(t.key) ?? { label: t.label, arr: [] };
    slot.arr.push(e);
    buckets.set(t.key, slot);
  }
  const out: Group<T>[] = [];
  const order = TYPE_ORDER.map((t) => t.key);
  // Anything we couldn't classify lands in "Other" at the end.
  if (buckets.has('other')) order.push('other');
  for (const k of order) {
    const slot = buckets.get(k);
    if (!slot || slot.arr.length === 0) continue;
    out.push({
      key: `type:${k}`,
      label: slot.label,
      icon: k === 'other'
        ? { kind: 'none' }
        : { kind: 'type', type: k as Exclude<GroupIcon & { kind: 'type' }, never>['type'] },
      entries: slot.arr,
      cardCount: slot.arr.reduce((s, e) => s + entryTotalCopies(e), 0),
      uniqueCount: slot.arr.reduce((s, e) => s + entryUniqueVariants(e), 0),
      subtotal: slot.arr.reduce((s, e) => s + entrySubtotalUSD(e), 0),
    });
  }
  return out;
}

function groupByTags<T extends CardEntry>(
  entries: T[],
  tagsByEntryId?: Map<string, string[]>,
  tagsCatalog?: GroupContext['tagsCatalog'],
): Group<T>[] {
  const tagBuckets = new Map<string, T[]>();
  const untagged: T[] = [];
  if (!tagsByEntryId || tagsByEntryId.size === 0) {
    for (const e of entries) untagged.push(e);
  } else {
    for (const e of entries) {
      const ids = tagsByEntryId.get(e.id);
      if (!ids || ids.length === 0) {
        untagged.push(e);
        continue;
      }
      // A card with N tags appears in N groups — natural for browse.
      for (const id of ids) {
        const arr = tagBuckets.get(id) ?? [];
        arr.push(e);
        tagBuckets.set(id, arr);
      }
    }
  }

  const meta = new Map(
    (tagsCatalog ?? []).map((t) => [t.id, t]),
  );

  const out: Group<T>[] = [];
  for (const [id, arr] of tagBuckets) {
    const m = meta.get(id);
    out.push({
      key: `tag:${id}`,
      label: m?.name ?? 'Tag',
      icon: { kind: 'tag', color: m?.color ?? null },
      accent: m?.color ?? undefined,
      entries: arr,
      cardCount: arr.reduce((s, e) => s + entryTotalCopies(e), 0),
      uniqueCount: arr.reduce((s, e) => s + entryUniqueVariants(e), 0),
      subtotal: arr.reduce((s, e) => s + entrySubtotalUSD(e), 0),
    });
  }
  // Most-used tag first inside the tagged section.
  out.sort((a, b) => b.cardCount - a.cardCount);

  if (untagged.length > 0) {
    out.push({
      key: 'tag:__untagged__',
      label: 'Untagged',
      icon: { kind: 'none' },
      entries: untagged,
      cardCount: untagged.reduce((s, e) => s + entryTotalCopies(e), 0),
      uniqueCount: untagged.reduce((s, e) => s + entryUniqueVariants(e), 0),
      subtotal: untagged.reduce((s, e) => s + entrySubtotalUSD(e), 0),
    });
  }
  return out;
}
