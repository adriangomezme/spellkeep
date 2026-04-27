import type { ScryfallCard } from '../scryfall';

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
