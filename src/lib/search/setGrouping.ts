import type { ScryfallCard } from '../scryfall';
import type { Group } from '../cardListUtils';

// Reproduces Scryfall's set-detail categorization (Draft Cards /
// Borderless / Showcase / Extended Art / Full Art Lands / etc) using
// the metadata our snapshot now carries: frame_effects, border_color,
// promo, promo_types, full_art, finishes, layout.
//
// When a snapshot predates these columns the function falls back to a
// coarse heuristic (Main vs Bonus vs Variants) so the screen still
// renders something useful while users wait for the next snapshot.

export type SetGroup = {
  /** Stable id used as a SectionList section key. */
  id: string;
  title: string;
  cards: ScryfallCard[];
  /** Drives the order of sections on the page. Lower = earlier. */
  rank: number;
};

const LAYOUT_GROUP_TITLE: Record<string, string> = {
  token: 'Tokens',
  emblem: 'Emblems',
  art_series: 'Art Series',
  double_faced_token: 'Double-faced Tokens',
  reversible_card: 'Reversible Cards',
  planar: 'Planes',
  scheme: 'Schemes',
  vanguard: 'Vanguards',
};

function isPureNumeric(cn: string): boolean {
  return /^\d+$/.test(cn);
}

function numericPart(cn: string): number {
  const m = cn.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

/**
 * Categorize a single card into a (rank, id, title) bucket. Order of
 * checks matters — a borderless showcase card ends up in "Borderless"
 * because Scryfall surfaces border_color first.
 */
function bucketize(
  card: ScryfallCard,
  setCardCount: number | null
): { rank: number; id: string; title: string } {
  const layout = card.layout ?? 'normal';
  if (LAYOUT_GROUP_TITLE[layout]) {
    return { rank: 90, id: `layout-${layout}`, title: LAYOUT_GROUP_TITLE[layout] };
  }

  const frame = card.frame_effects ?? [];
  const promoTypes = card.promo_types ?? [];
  const border = card.border_color ?? '';
  const isFullArt = card.full_art === true;
  const isPromo = card.promo === true;
  const cn = card.collector_number ?? '';
  const numeric = isPureNumeric(cn);
  const n = numeric ? parseInt(cn, 10) : Number.MAX_SAFE_INTEGER;

  // Borderless first — it's the most visually distinct.
  if (border === 'borderless') {
    return { rank: 30, id: 'borderless', title: 'Borderless Cards' };
  }

  // Specialized frame effects that Scryfall surfaces as their own
  // groupings.
  if (frame.includes('extendedart')) {
    return { rank: 50, id: 'extendedart', title: 'Extended Art Cards' };
  }
  if (frame.includes('showcase') || promoTypes.includes('showcase')) {
    return { rank: 40, id: 'showcase', title: 'Showcase Cards' };
  }
  if (frame.includes('inverted')) {
    return { rank: 41, id: 'inverted', title: 'Inverted Frame Cards' };
  }
  if (frame.includes('etched')) {
    return { rank: 42, id: 'etched', title: 'Etched Cards' };
  }

  if (isFullArt) {
    return { rank: 25, id: 'fullart', title: 'Full Art Cards' };
  }

  if (isPromo) {
    return { rank: 70, id: 'promos', title: 'Promos' };
  }

  if (!numeric || (setCardCount != null && n > setCardCount)) {
    return { rank: 80, id: 'bonus', title: 'Bonus / Special Cards' };
  }

  return { rank: 10, id: 'main', title: 'Main Set' };
}

/**
 * Group a set's cards into Scryfall-style sections. Returned in the
 * canonical display order via each bucket's `rank`.
 */
export function groupCardsForSet(
  cards: ScryfallCard[],
  setCardCount: number | null
): SetGroup[] {
  if (cards.length === 0) return [];

  const groups = new Map<string, SetGroup>();
  for (const c of cards) {
    const b = bucketize(c, setCardCount);
    let g = groups.get(b.id);
    if (!g) {
      g = { id: b.id, title: b.title, cards: [], rank: b.rank };
      groups.set(b.id, g);
    }
    g.cards.push(c);
  }

  // Sort cards inside each group by collector_number.
  for (const g of groups.values()) {
    g.cards.sort((a, b) => {
      const na = numericPart(a.collector_number);
      const nb = numericPart(b.collector_number);
      if (na !== nb) return na - nb;
      return (a.collector_number ?? '').localeCompare(b.collector_number ?? '');
    });
  }

  return Array.from(groups.values()).sort((a, b) => a.rank - b.rank);
}

// ──────────────────────────────────────────────────────────────────
// Group By dispatcher — used by the Set Detail screen.
//
// `print_group` reuses the section logic above (Main / Borderless /
// Showcase / Extended Art / Promos / Tokens / Art Series / etc) and
// always sorts by collector number inside each section — the natural
// reading order for a set.
//
// The other modes (rarity, color, type) are simple bucketings over
// the *already sorted* card list, so the cards inside each bucket
// keep whatever sort the user picked in the toolbar.
// ──────────────────────────────────────────────────────────────────

export type SetGroupKind = 'rarity' | 'color' | 'type' | 'print_group';

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

const COLOR_DISPLAY_ORDER: Record<string, number> = {
  W: 0,
  U: 1,
  B: 2,
  R: 3,
  G: 4,
  multi: 5,
  colorless: 6,
};

// Planeswalker first — see cardListUtils.ts for the rationale (kept
// in lockstep so binder / list / owned / set views all order the
// type buckets identically).
const TYPE_ORDER: Array<{ key: string; needle: string; label: string }> = [
  { key: 'planeswalker', needle: 'planeswalker', label: 'Planeswalker' },
  { key: 'creature', needle: 'creature', label: 'Creature' },
  { key: 'battle', needle: 'battle', label: 'Battle' },
  { key: 'artifact', needle: 'artifact', label: 'Artifact' },
  { key: 'enchantment', needle: 'enchantment', label: 'Enchantment' },
  { key: 'instant', needle: 'instant', label: 'Instant' },
  { key: 'sorcery', needle: 'sorcery', label: 'Sorcery' },
  { key: 'land', needle: 'land', label: 'Land' },
];

function colorBucket(card: ScryfallCard): string {
  const ci = card.color_identity ?? [];
  if (ci.length === 0) return 'colorless';
  if (ci.length > 1) return 'multi';
  return ci[0];
}

function typeBucket(card: ScryfallCard): { key: string; label: string } {
  const tl = (card.type_line ?? '').toLowerCase();
  for (const t of TYPE_ORDER) {
    if (tl.includes(t.needle)) return { key: t.key, label: t.label };
  }
  return { key: 'other', label: 'Other' };
}

export function groupSetCardsBy(
  cards: ScryfallCard[],
  kind: SetGroupKind,
  setCardCount: number | null
): Group<ScryfallCard>[] {
  if (cards.length === 0) return [];

  if (kind === 'print_group') {
    const setGroups = groupCardsForSet(cards, setCardCount);
    return setGroups.map<Group<ScryfallCard>>((g) => ({
      key: g.id,
      label: g.title,
      icon: { kind: 'none' },
      entries: g.cards,
      cardCount: g.cards.length,
      uniqueCount: g.cards.length,
      subtotal: null,
    }));
  }

  if (kind === 'rarity') {
    const buckets = new Map<string, ScryfallCard[]>();
    for (const c of cards) {
      const r = (c.rarity ?? '').toLowerCase() || 'common';
      const arr = buckets.get(r) ?? [];
      arr.push(c);
      buckets.set(r, arr);
    }
    const order = ['mythic', 'rare', 'uncommon', 'common', 'special', 'bonus'];
    const out: Group<ScryfallCard>[] = [];
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
        cardCount: arr.length,
        uniqueCount: arr.length,
        subtotal: null,
      });
    }
    return out;
  }

  if (kind === 'color') {
    const buckets = new Map<string, ScryfallCard[]>();
    for (const c of cards) {
      const k = colorBucket(c);
      const arr = buckets.get(k) ?? [];
      arr.push(c);
      buckets.set(k, arr);
    }
    const keys = Array.from(buckets.keys()).sort(
      (a, b) => (COLOR_DISPLAY_ORDER[a] ?? 99) - (COLOR_DISPLAY_ORDER[b] ?? 99)
    );
    return keys.map<Group<ScryfallCard>>((k) => {
      const arr = buckets.get(k)!;
      return {
        key: `color:${k}`,
        label: COLOR_LABEL[k] ?? k,
        icon: {
          kind: 'color',
          color: k as 'W' | 'U' | 'B' | 'R' | 'G' | 'multi' | 'colorless',
        },
        entries: arr,
        cardCount: arr.length,
        uniqueCount: arr.length,
        subtotal: null,
      };
    });
  }

  // kind === 'type'
  const buckets = new Map<string, { label: string; arr: ScryfallCard[] }>();
  for (const c of cards) {
    const t = typeBucket(c);
    const slot = buckets.get(t.key) ?? { label: t.label, arr: [] };
    slot.arr.push(c);
    buckets.set(t.key, slot);
  }
  const order = TYPE_ORDER.map((t) => t.key);
  if (buckets.has('other')) order.push('other');
  const out: Group<ScryfallCard>[] = [];
  for (const k of order) {
    const slot = buckets.get(k);
    if (!slot || slot.arr.length === 0) continue;
    out.push({
      key: `type:${k}`,
      label: slot.label,
      icon:
        k === 'other'
          ? { kind: 'none' }
          : {
              kind: 'type',
              type: k as
                | 'creature'
                | 'instant'
                | 'sorcery'
                | 'artifact'
                | 'enchantment'
                | 'land'
                | 'planeswalker'
                | 'battle',
            },
      entries: slot.arr,
      cardCount: slot.arr.length,
      uniqueCount: slot.arr.length,
      subtotal: null,
    });
  }
  return out;
}
