// Filter state for the Search tab. Distinct from the collection
// FilterState (FilterSheet.tsx) because Search browses the entire MTG
// universe and exposes Scryfall-syntax dimensions that don't apply to
// what's already in your binders (oracle text, keywords, legalities,
// power/toughness, etc).

import type { ColorMatchMode } from '../../components/collection/FilterSheet';

export type StatComparator = 'eq' | 'gte' | 'lte';

/**
 * How a multi-selection filter combines its picks against the result
 * set. Borrowed visually from the color-match segmented control:
 *  - `any`  match cards that satisfy AT LEAST ONE selection (OR)
 *  - `all`  match cards that satisfy EVERY selection (AND)
 *  - `not`  exclude cards that match ANY selection (negated AND)
 *
 * Defaults to `any` everywhere — that's what users intuitively expect
 * when they tick multiple checkboxes.
 */
export type MultiSelectMode = 'any' | 'all' | 'not';

export type StatFilter = {
  comparator: StatComparator;
  /** Free-text so users can type `*`, `X`, etc. — Scryfall accepts
   *  these for power/toughness/loyalty. Empty string = filter off. */
  value: string;
};

export type LegalityStatus = 'legal' | 'restricted' | 'banned';

/**
 * Oracle-text constraints are per-phrase rather than list-wide because
 * a single search often mixes inclusive and exclusive intent — e.g.
 * "counter target spell, but not creature spells" means INCLUDE
 * "counter target" AND EXCLUDE "creature". A list-level mode can't
 * express that.
 *
 * Combine semantics in `buildSearchQueryFragment`:
 *  - phrases with mode `all`  → AND'd as plain `o:"…"` clauses
 *  - phrases with mode `any`  → OR'd inside one parenthesised group,
 *                               then AND'd against the rest
 *  - phrases with mode `not`  → prefixed with `-` (Scryfall negation)
 */
export type OracleTextConstraint = {
  text: string;
  mode: MultiSelectMode;
};

export type SearchUniqueMode = 'art' | 'cards' | 'prints';

export type SearchFilterState = {
  // ── Meta toggles (always visible at the top) ──
  /** Wraps the user's text in `!"..."` for an exact name match. */
  exactName: boolean;
  /** How printings are deduplicated in the result set:
   *  - `cards`  one row per oracle_id (one card concept)
   *  - `art`    one row per illustration_id (Scryfall's default)
   *  - `prints` every printing of every card */
  uniqueMode: SearchUniqueMode;

  // ── Simple ──
  colors: string[];
  colorsMode: ColorMatchMode;
  colorIdentity: string[];
  colorIdentityMode: ColorMatchMode;
  rarity: string[];
  /** Game availability — `game:arena`, `game:paper`, `game:mtgo`,
   *  `game:astral`. Multi-select OR'd. */
  games: string[];
  /** Top-level types from `/catalog/card-types` (Creature, Artifact,
   *  Land, Planeswalker, etc). */
  types: string[];
  typesMode: MultiSelectMode;
  /** Supertypes from `/catalog/supertypes` (Basic, Snow, World,
   *  Legendary, etc). Small static list rendered as chips. */
  supertypes: string[];
  supertypesMode: MultiSelectMode;
  /** Subtypes (creature types, planeswalker types, land types) from
   *  the corresponding Scryfall catalogs. Combined into the query
   *  with the same `t:` operator. */
  subtypes: string[];
  subtypesMode: MultiSelectMode;
  manaValue: StatFilter;
  price: StatFilter;
  sets: string[];

  // ── Advanced (online-only) ──
  keywords: string[];
  keywordsMode: MultiSelectMode;
  legalities: { format: string; status: LegalityStatus }[];
  legalitiesMode: MultiSelectMode;
  /** Per-phrase constraints (each row carries its own any/all/not).
   *  See `OracleTextConstraint` for the combine semantics. */
  oracleTexts: OracleTextConstraint[];
  power: StatFilter;
  toughness: StatFilter;
  loyalty: StatFilter;
  producedMana: string[];
  producedManaMode: MultiSelectMode;
  /** "Produces N or more colors" — translates to `produces>=N` /
   *  `produces=N` / `produces<=N`. Empty value means "no constraint",
   *  same as the other StatFilters. */
  producedManaCount: StatFilter;
  artists: string[];

  // ── Miscellaneous flags ──
  reservedList: boolean;
  gameChanger: boolean;
  universesBeyond: boolean;
  promo: boolean;
  reprint: boolean;
};

const EMPTY_STAT: StatFilter = { comparator: 'gte', value: '' };

export const EMPTY_SEARCH_FILTERS: SearchFilterState = {
  exactName: false,
  uniqueMode: 'art',
  colors: [],
  colorsMode: 'gte',
  colorIdentity: [],
  colorIdentityMode: 'lte',
  rarity: [],
  games: [],
  types: [],
  typesMode: 'any',
  supertypes: [],
  supertypesMode: 'any',
  subtypes: [],
  subtypesMode: 'any',
  manaValue: { ...EMPTY_STAT },
  price: { ...EMPTY_STAT },
  sets: [],
  keywords: [],
  keywordsMode: 'any',
  legalities: [],
  legalitiesMode: 'any',
  oracleTexts: [],
  power: { ...EMPTY_STAT },
  toughness: { ...EMPTY_STAT },
  loyalty: { ...EMPTY_STAT },
  producedMana: [],
  producedManaMode: 'any',
  producedManaCount: { ...EMPTY_STAT },
  artists: [],
  reservedList: false,
  gameChanger: false,
  universesBeyond: false,
  promo: false,
  reprint: false,
};

/**
 * Count active filter dimensions. Defensive against partial states —
 * persisted presets and AI responses can pre-date schema additions, so
 * every access uses optional-chaining / fallbacks instead of trusting
 * the static type.
 */
export function countActiveSearchFilters(
  f: Partial<SearchFilterState>
): number {
  let n = 0;
  if (f.colors?.length) n++;
  if (f.colorIdentity?.length) n++;
  if (f.rarity?.length) n++;
  if (f.games?.length) n++;
  if (f.types?.length) n++;
  if (f.supertypes?.length) n++;
  if (f.subtypes?.length) n++;
  if (f.manaValue?.value?.trim()) n++;
  if (f.price?.value?.trim()) n++;
  if (f.sets?.length) n++;
  if (f.keywords?.length) n++;
  if (f.legalities?.length) n++;
  if (
    Array.isArray(f.oracleTexts) &&
    (f.oracleTexts as unknown[]).some((p) => {
      if (typeof p === 'string') return p.trim().length > 0;
      const text = (p as { text?: unknown } | null)?.text;
      return typeof text === 'string' && text.trim().length > 0;
    })
  )
    n++;
  if (f.power?.value?.trim()) n++;
  if (f.toughness?.value?.trim()) n++;
  if (f.loyalty?.value?.trim()) n++;
  if (f.producedMana?.length) n++;
  if (f.producedManaCount?.value?.trim()) n++;
  if (f.artists?.length) n++;
  if (f.reservedList) n++;
  if (f.gameChanger) n++;
  if (f.universesBeyond) n++;
  if (f.promo) n++;
  if (f.reprint) n++;
  return n;
}

/**
 * Defensive coercion for `oracleTexts` so older AsyncStorage presets
 * (or AI responses from before the schema change) — which carried
 * `string[]` instead of `OracleTextConstraint[]` — keep working.
 * Plain strings become `{ text, mode: 'all' }` (the old default).
 */
export function normalizeOracleTexts(
  raw: unknown
): OracleTextConstraint[] {
  if (!Array.isArray(raw)) return [];
  const out: OracleTextConstraint[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const text = item.trim();
      if (text) out.push({ text, mode: 'all' });
      continue;
    }
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as OracleTextConstraint).text === 'string'
    ) {
      const obj = item as OracleTextConstraint;
      const text = obj.text.trim();
      const mode: MultiSelectMode =
        obj.mode === 'any' || obj.mode === 'not' ? obj.mode : 'all';
      if (text) out.push({ text, mode });
    }
  }
  return out;
}

export function countActiveMetaToggles(f: SearchFilterState): number {
  let n = 0;
  if (f.exactName) n++;
  if (f.uniqueMode !== 'art') n++;
  return n;
}
