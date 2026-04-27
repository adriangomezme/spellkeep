import type { MultiSelectMode, SearchFilterState, StatFilter } from './searchFilters';

const COLOR_MODE_OP: Record<string, string> = {
  gte: '>=',
  eq: '=',
  lte: '<=',
};

const STAT_OP: Record<string, string> = {
  eq: '=',
  gte: '>=',
  lte: '<=',
};

function statClause(field: string, stat: StatFilter): string | null {
  const v = stat.value.trim();
  if (!v) return null;
  return `${field}${STAT_OP[stat.comparator]}${v}`;
}

/**
 * Combine N selected values into one Scryfall syntax fragment under a
 * given multi-select mode. `formatOne` builds the per-value clause
 * (e.g. `t:creature`, `keyword:flying`).
 *
 * - `any`: `(t:a OR t:b)` — at least one matches
 * - `all`: `t:a t:b` — every one matches (implicit AND)
 * - `not`: `-t:a -t:b` — none of them match (negated AND)
 */
function combineMulti(values: string[], mode: MultiSelectMode, formatOne: (v: string) => string): string {
  if (values.length === 0) return '';
  const clauses = values.map(formatOne);
  if (mode === 'not') {
    return clauses.map((c) => `-${c}`).join(' ');
  }
  if (mode === 'all') {
    return clauses.join(' ');
  }
  // any (default)
  if (clauses.length === 1) return clauses[0];
  return `(${clauses.join(' OR ')})`;
}

/**
 * Translates the user-facing filter state into a Scryfall syntax
 * fragment appended to the user's text query.
 */
export function buildSearchQueryFragment(f: SearchFilterState): string {
  const parts: string[] = [];

  if (f.colors.length) {
    const colorString = f.colors.filter((c) => c !== 'C').join('').toLowerCase();
    const includesColorless = f.colors.includes('C');
    if (colorString) {
      parts.push(`c${COLOR_MODE_OP[f.colorsMode]}${colorString}`);
    }
    if (includesColorless && f.colorsMode !== 'lte') {
      parts.push('c=c');
    }
  }

  if (f.colorIdentity.length) {
    const colorString = f.colorIdentity.filter((c) => c !== 'C').join('').toLowerCase();
    if (colorString) {
      parts.push(`id${COLOR_MODE_OP[f.colorIdentityMode]}${colorString}`);
    } else if (f.colorIdentity.includes('C')) {
      parts.push('id=c');
    }
  }

  if (f.rarity.length === 1) {
    parts.push(`r:${f.rarity[0]}`);
  } else if (f.rarity.length > 1) {
    parts.push(`(${f.rarity.map((r) => `r:${r}`).join(' OR ')})`);
  }

  const typeFragment = combineMulti(f.types, f.typesMode, (t) => `t:${t.toLowerCase()}`);
  if (typeFragment) parts.push(typeFragment);

  const supertypeFragment = combineMulti(f.supertypes, f.supertypesMode, (t) => `t:${t.toLowerCase()}`);
  if (supertypeFragment) parts.push(supertypeFragment);

  const subtypeFragment = combineMulti(f.subtypes, f.subtypesMode, (t) => `t:${t.toLowerCase()}`);
  if (subtypeFragment) parts.push(subtypeFragment);

  const cmcClause = statClause('cmc', f.manaValue);
  if (cmcClause) parts.push(cmcClause);

  const priceClause = statClause('usd', f.price);
  if (priceClause) parts.push(priceClause);

  if (f.sets.length === 1) {
    parts.push(`set:${f.sets[0].toLowerCase()}`);
  } else if (f.sets.length > 1) {
    parts.push(`(${f.sets.map((s) => `set:${s.toLowerCase()}`).join(' OR ')})`);
  }

  if (f.games.length === 1) {
    parts.push(`game:${f.games[0]}`);
  } else if (f.games.length > 1) {
    parts.push(`(${f.games.map((g) => `game:${g}`).join(' OR ')})`);
  }

  // ── Advanced ──

  const keywordFragment = combineMulti(f.keywords, f.keywordsMode, (k) => {
    const lower = k.toLowerCase();
    return /\s/.test(lower) ? `keyword:"${lower}"` : `keyword:${lower}`;
  });
  if (keywordFragment) parts.push(keywordFragment);

  // Legality multi-select with mode. Each entry's `status` is captured
  // alongside the format key so the user can mix "legal in modern" +
  // "banned in legacy" if they wanted (current UI defaults all to
  // legal — banned/restricted UI can come later).
  const legalityFragment = combineMulti(
    f.legalities.map((l) => `${l.status}:${l.format}`),
    f.legalitiesMode,
    (clause) => clause
  );
  if (legalityFragment) parts.push(legalityFragment);

  // Per-phrase oracle constraints. Group by mode so we can mix
  // includes (AND), alternatives (OR group) and excludes (negated)
  // in the same query — required for prompts like
  //   "counter target spell, but NOT creature spells"
  //   = include "counter target" + exclude "creature".
  const oracleClause = (text: string) =>
    `o:"${text.trim().replace(/"/g, '')}"`;
  const allPhrases = f.oracleTexts
    .filter((p) => p.mode === 'all' && p.text.trim());
  const anyPhrases = f.oracleTexts
    .filter((p) => p.mode === 'any' && p.text.trim());
  const notPhrases = f.oracleTexts
    .filter((p) => p.mode === 'not' && p.text.trim());

  for (const p of allPhrases) parts.push(oracleClause(p.text));
  if (anyPhrases.length === 1) {
    parts.push(oracleClause(anyPhrases[0].text));
  } else if (anyPhrases.length > 1) {
    parts.push(
      `(${anyPhrases.map((p) => oracleClause(p.text)).join(' OR ')})`
    );
  }
  for (const p of notPhrases) parts.push(`-${oracleClause(p.text)}`);

  const powClause = statClause('pow', f.power);
  if (powClause) parts.push(powClause);
  const touClause = statClause('tou', f.toughness);
  if (touClause) parts.push(touClause);
  const loyClause = statClause('loy', f.loyalty);
  if (loyClause) parts.push(loyClause);

  // Produced mana — supports any/all/not across the selected colors.
  // `produces:wu` in Scryfall means "produces W AND U", so for ANY we
  // need to OR each color with `produces:x`.
  const producedFragment = combineMulti(
    f.producedMana.map((c) => c.toLowerCase()),
    f.producedManaMode,
    (c) => `produces:${c}`
  );
  if (producedFragment) parts.push(producedFragment);

  // Numeric "produces N or more colors" constraint — orthogonal to the
  // multi-select above. `produces>=3` is a Scryfall-supported syntax.
  const producedCountClause = statClause('produces', f.producedManaCount);
  if (producedCountClause) parts.push(producedCountClause);

  for (const a of f.artists) {
    parts.push(`a:"${a.replace(/"/g, '')}"`);
  }

  // ── Miscellaneous flags ──
  if (f.reservedList) parts.push('is:reserved');
  if (f.gameChanger) parts.push('is:gamechanger');
  if (f.universesBeyond) parts.push('is:universesbeyond');
  if (f.promo) parts.push('is:promo');
  if (f.reprint) parts.push('is:reprint');

  return parts.join(' ');
}
