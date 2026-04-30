import type { Ionicons } from '@expo/vector-icons';

// ──────────────────────────────────────────────────────────────────────
// Live Scryfall-syntax parser used by the search bar to detect
// operator clauses as the user types and surface them as visual chips
// below the input. The parser is non-destructive — the user's text
// passes through to Scryfall unchanged. Chips are advisory: the user
// sees what their syntax means and can tap to remove a clause.
// ──────────────────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export type ClauseCategory =
  | 'color'
  | 'identity'
  | 'type'
  | 'oracle'
  | 'set'
  | 'rarity'
  | 'cmc'
  | 'stat'
  | 'flag'
  | 'legality'
  | 'keyword'
  | 'artist'
  | 'game';

export type ParsedClause = {
  /** Canonical operator key (e.g. `c`, `cmc`, `legal`). */
  operator: string;
  /** Comparator as the user typed it: `:`, `=`, `<`, `>`, `<=`, `>=`. */
  comparator: string;
  /** Value as the user typed it (with quotes preserved). */
  value: string;
  /** Original raw match (e.g. `c>=r`, `o:"draws"`). */
  raw: string;
  /** Index in the source query. */
  start: number;
  /** Exclusive end index. */
  end: number;
  /** Bucket the chip belongs to — drives icon + accent color. */
  category: ClauseCategory;
  /** Human-readable label rendered inside the chip. */
  label: string;
  /** Ionicon name for the leading glyph. */
  icon: IoniconName;
};

// ──────────────────────────────────────────────────────────────────────
// Operator catalog — maps each Scryfall short form to its category.
// Order matters in the regex (longer aliases first so `color` doesn't
// get truncated to `c`).
// ──────────────────────────────────────────────────────────────────────

const OPERATORS: { aliases: string[]; category: ClauseCategory; canonical: string }[] = [
  { aliases: ['color', 'c'], category: 'color', canonical: 'c' },
  { aliases: ['identity', 'id'], category: 'identity', canonical: 'id' },
  { aliases: ['type', 't'], category: 'type', canonical: 't' },
  { aliases: ['oracle', 'o'], category: 'oracle', canonical: 'o' },
  { aliases: ['edition', 'set', 'e', 's'], category: 'set', canonical: 'set' },
  { aliases: ['rarity', 'r'], category: 'rarity', canonical: 'r' },
  { aliases: ['cmc', 'mv'], category: 'cmc', canonical: 'cmc' },
  { aliases: ['power', 'pow'], category: 'stat', canonical: 'pow' },
  { aliases: ['toughness', 'tou'], category: 'stat', canonical: 'tou' },
  { aliases: ['loyalty', 'loy'], category: 'stat', canonical: 'loy' },
  { aliases: ['is'], category: 'flag', canonical: 'is' },
  { aliases: ['legal'], category: 'legality', canonical: 'legal' },
  { aliases: ['banned'], category: 'legality', canonical: 'banned' },
  { aliases: ['restricted'], category: 'legality', canonical: 'restricted' },
  { aliases: ['keyword', 'kw'], category: 'keyword', canonical: 'keyword' },
  { aliases: ['artist', 'a'], category: 'artist', canonical: 'a' },
  { aliases: ['game'], category: 'game', canonical: 'game' },
];

const ALIAS_INDEX: Map<string, { category: ClauseCategory; canonical: string }> = (() => {
  const m = new Map<string, { category: ClauseCategory; canonical: string }>();
  for (const op of OPERATORS) {
    for (const a of op.aliases) {
      m.set(a.toLowerCase(), { category: op.category, canonical: op.canonical });
    }
  }
  return m;
})();

// All aliases joined for the regex, sorted by length DESC so the
// engine picks `color` over `c` when both could match.
const ALIAS_PATTERN = OPERATORS.flatMap((o) => o.aliases)
  .sort((a, b) => b.length - a.length)
  .join('|');

// Match `(operator)(comparator)(value)` at a token boundary. The
// boundary may be the start of the string, whitespace, or an opening
// paren — Scryfall syntax allows grouping like `(t:angel OR t:demon)`
// where the operator immediately follows `(`. Without `(` in the
// look-behind, the first clause inside parens slipped through and
// the second clause's value greedily swallowed the closing `)`.
//
// The value can be a quoted string or a non-whitespace, non-`)` run
// — stopping at `)` keeps the closing paren of a group clause from
// becoming part of the matched value.
const CLAUSE_RE = new RegExp(
  `(?:^|(?<=[\\s(]))(${ALIAS_PATTERN})(>=|<=|=|<|>|:)("[^"]*"|[^\\s)]+)`,
  'gi'
);

// ──────────────────────────────────────────────────────────────────────
// Humanizers
// ──────────────────────────────────────────────────────────────────────

const COLOR_NAMES: Record<string, string> = {
  w: 'White',
  u: 'Blue',
  b: 'Black',
  r: 'Red',
  g: 'Green',
  c: 'Colorless',
};

const RARITY_NAMES: Record<string, string> = {
  common: 'Common',
  c: 'Common',
  uncommon: 'Uncommon',
  u: 'Uncommon',
  rare: 'Rare',
  r: 'Rare',
  mythic: 'Mythic',
  m: 'Mythic',
};

const COMPARATOR_GLYPH: Record<string, string> = {
  '>=': '≥',
  '<=': '≤',
  '>': '>',
  '<': '<',
  '=': '=',
  ':': ':',
};

function humanizeColors(value: string): string {
  const cleaned = value.replace(/^"|"$/g, '').toLowerCase();
  // Multicolor codes ("wug") expand letter by letter; named guilds /
  // wedges (e.g. "azorius") pass through capitalized.
  if (cleaned.length <= 5 && /^[wubrgc]+$/.test(cleaned)) {
    return cleaned
      .split('')
      .map((c) => COLOR_NAMES[c] ?? c.toUpperCase())
      .join(', ');
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function unquote(value: string): string {
  return value.replace(/^"|"$/g, '');
}

function labelFor(
  category: ClauseCategory,
  canonical: string,
  comparator: string,
  value: string
): string {
  const cmp = COMPARATOR_GLYPH[comparator] ?? comparator;
  switch (category) {
    case 'color':
      return `Color: ${humanizeColors(value)}`;
    case 'identity':
      return `Color identity: ${humanizeColors(value)}`;
    case 'type':
      return `Type: ${unquote(value)}`;
    case 'oracle':
      return `Text: "${unquote(value)}"`;
    case 'set':
      return `Set: ${unquote(value).toUpperCase()}`;
    case 'rarity': {
      const v = unquote(value).toLowerCase();
      return `Rarity: ${RARITY_NAMES[v] ?? unquote(value)}`;
    }
    case 'cmc':
      return `Mana value ${cmp} ${unquote(value)}`;
    case 'stat': {
      const statLabel =
        canonical === 'pow' ? 'Power' :
        canonical === 'tou' ? 'Toughness' :
        canonical === 'loy' ? 'Loyalty' : canonical;
      return `${statLabel} ${cmp} ${unquote(value)}`;
    }
    case 'flag': {
      // is:reserved, is:promo, is:reprint, etc.
      const v = unquote(value).toLowerCase();
      const pretty = v.charAt(0).toUpperCase() + v.slice(1);
      return `Is ${pretty}`;
    }
    case 'legality': {
      const verb =
        canonical === 'legal' ? 'Legal in' :
        canonical === 'banned' ? 'Banned in' : 'Restricted in';
      const v = unquote(value);
      return `${verb} ${v.charAt(0).toUpperCase() + v.slice(1)}`;
    }
    case 'keyword':
      return `Keyword: ${unquote(value)}`;
    case 'artist':
      return `Artist: ${unquote(value)}`;
    case 'game':
      return `Game: ${unquote(value).charAt(0).toUpperCase() + unquote(value).slice(1)}`;
  }
}

const ICON_FOR: Record<ClauseCategory, IoniconName> = {
  color: 'color-palette-outline',
  identity: 'layers-outline',
  type: 'cube-outline',
  oracle: 'document-text-outline',
  set: 'albums-outline',
  rarity: 'diamond-outline',
  cmc: 'flame-outline',
  stat: 'flash-outline',
  flag: 'pricetag-outline',
  legality: 'shield-checkmark-outline',
  keyword: 'bookmarks-outline',
  artist: 'brush-outline',
  game: 'game-controller-outline',
};

// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────

export function parseScryfallSyntax(query: string): ParsedClause[] {
  const out: ParsedClause[] = [];
  if (!query) return out;
  // Reset lastIndex when regex has /g flag and we're in a tight loop.
  CLAUSE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLAUSE_RE.exec(query)) !== null) {
    const operator = m[1].toLowerCase();
    const comparator = m[2];
    const value = m[3];
    const meta = ALIAS_INDEX.get(operator);
    if (!meta) continue;
    const start = m.index;
    const raw = m[0];
    out.push({
      operator,
      comparator,
      value,
      raw,
      start,
      end: start + raw.length,
      category: meta.category,
      label: labelFor(meta.category, meta.canonical, comparator, value),
      icon: ICON_FOR[meta.category],
    });
  }
  return out;
}

/**
 * Remove a parsed clause from the query string and collapse any
 * surrounding whitespace. Used when the user taps the X on a chip.
 */
export function removeClauseFromQuery(query: string, clause: ParsedClause): string {
  const before = query.slice(0, clause.start);
  const after = query.slice(clause.end);
  return (before + ' ' + after).replace(/\s+/g, ' ').trim();
}
