/**
 * Scryfall API client with local-first behavior.
 *
 * Reads go to the local catalog (catalog_cards) first. If the local
 * catalog has data, we answer from there — instant, offline-safe. When
 * the local catalog is empty (first boot, sync still in progress) or a
 * query pattern is too complex to handle locally, we fall through to
 * api.scryfall.com.
 *
 * The public function signatures stay identical to the old API-only
 * module so call sites don't need to change.
 */

import {
  autocompleteNames as localAutocompleteNames,
  findCardByName as localFindCardByName,
  findCardByNameAndPrint as localFindCardByNameAndPrint,
  findCardByScryfallId as localFindCardByScryfallId,
  findPrintsByName as localFindPrintsByName,
  findPrintsByNameInSet as localFindPrintsByNameInSet,
  findPrintsByOracleId as localFindPrintsByOracleId,
  isCatalogReady,
  searchByName as localSearchByName,
  searchByNameUniqueCards as localSearchByNameUniqueCards,
} from './catalog/catalogQueries';

const BASE_URL = 'https://api.scryfall.com';

export type ScryfallCard = {
  id: string;
  oracle_id: string;
  name: string;
  lang?: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity: string[];
  keywords: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  rarity: string;
  set: string;
  set_name: string;
  collector_number: string;
  image_uris?: {
    small: string;
    normal: string;
    large: string;
    art_crop: string;
  };
  card_faces?: {
    name: string;
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    flavor_text?: string;
    image_uris?: {
      small: string;
      normal: string;
      large: string;
      art_crop: string;
    };
  }[];
  flavor_text?: string;
  prices: {
    usd?: string;
    usd_foil?: string;
    usd_etched?: string;
    eur?: string;
    eur_foil?: string;
  };
  legalities: Record<string, string>;
  released_at: string;
  artist?: string;
  layout: string;
  produced_mana?: string[];
  finishes?: string[];
  prints_search_uri?: string;
  edhrec_rank?: number | null;
  // ── Set-grouping metadata (added 2026-04-27) ──
  // Older snapshots don't carry these; consumers handle null safely.
  // `finishes` already exists above; the other fields are new.
  frame_effects?: string[];
  border_color?: string;
  promo_types?: string[];
  full_art?: boolean;
  promo?: boolean;
};

export type ScryfallSearchResult = {
  object: string;
  total_cards: number;
  has_more: boolean;
  data: ScryfallCard[];
};

export type ScryfallAutocomplete = {
  object: string;
  total_values: number;
  data: string[];
};

/**
 * Autocomplete card names. Returns up to 20 suggestions.
 * Very fast — Scryfall caches these aggressively.
 */
export async function autocomplete(query: string): Promise<string[]> {
  if (query.length < 2) return [];

  if (await isCatalogReady()) {
    const local = await localAutocompleteNames(query);
    if (local.length > 0) return local;
  }

  try {
    const response = await fetch(
      `${BASE_URL}/cards/autocomplete?q=${encodeURIComponent(query)}`
    );
    if (!response.ok) return [];
    const data: ScryfallAutocomplete = await response.json();
    return data.data;
  } catch {
    return [];
  }
}

export type SearchSortKey =
  | 'name'
  | 'released'
  | 'cmc'
  | 'usd'
  | 'color'
  | 'rarity'
  | 'set'
  | 'edhrec';

export type SearchUniqueMode = 'prints' | 'cards' | 'art';

export type SearchOptions = {
  page?: number;
  sortKey?: SearchSortKey;
  sortAsc?: boolean;
  /** `prints` (default) returns every printing — what the version
   *  picker / scan flow needs. `cards` collapses by oracle_id so a
   *  search for "Lightning Bolt" returns one row, matching Scryfall's
   *  default browse view. */
  unique?: SearchUniqueMode;
};

/**
 * Search cards with full Scryfall query syntax.
 *
 * `unique=prints` returns every printing rather than collapsing by
 * oracle_id, so a search for "Lightning Bolt" surfaces all 80+
 * versions instead of just one.
 */
/**
 * Search routing rules:
 *
 *  1. Try Scryfall first (with a short timeout). When the device is
 *     online, this guarantees the result set + ordering are 1:1 with
 *     scryfall.com — the canonical source of truth that users compare
 *     against.
 *  2. If the remote call fails (offline / 5xx / timeout), fall back to
 *     the local `catalog.db` snapshot. The local query is a close
 *     approximation but cannot reproduce Scryfall's full ranking logic
 *     for ties, especially in `unique=cards` mode where Scryfall picks
 *     a canonical print using internal metadata we don't carry.
 *  3. Empty `total_cards` from Scryfall is a legitimate "no results"
 *     and is returned directly — we do NOT fall back to local in that
 *     case, otherwise the local catalog might surface stale matches
 *     for queries Scryfall has updated to filter out.
 */
const REMOTE_TIMEOUT_MS = 6000;

export async function searchCards(
  query: string,
  opts: SearchOptions = {}
): Promise<ScryfallSearchResult | null> {
  if (query.length < 2) return null;
  const page = opts.page ?? 1;
  const unique = opts.unique ?? 'prints';

  // Remote first — this is the only way to get true 1:1 parity with
  // scryfall.com. `null` from the helper means "request failed for an
  // infrastructure reason"; we then try local. A successful response
  // (including zero results) short-circuits.
  const remote = await fetchRemoteSearch(query, page, opts.sortKey, opts.sortAsc, unique);
  if (remote !== null) return remote;

  if (await isCatalogReady()) {
    const local = await tryLocalSearch(query, page, opts.sortKey, opts.sortAsc, unique);
    if (local) return local;
  }

  return null;
}

async function fetchRemoteSearch(
  query: string,
  page: number,
  sortKey?: SearchSortKey,
  sortAsc?: boolean,
  unique: SearchUniqueMode = 'prints'
): Promise<ScryfallSearchResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  try {
    const params = [
      `q=${encodeURIComponent(query)}`,
      `page=${page}`,
      `unique=${unique}`,
    ];
    if (sortKey) {
      params.push(`order=${sortKey}`);
      params.push(`dir=${sortAsc ? 'asc' : 'desc'}`);
    }
    const response = await fetch(`${BASE_URL}/cards/search?${params.join('&')}`, {
      signal: controller.signal,
    });
    // 404 from Scryfall = "no cards match" — that's a legitimate empty
    // result, not a transport failure, so surface it as such instead of
    // triggering the local fallback path.
    if (response.status === 404) {
      return {
        object: 'list',
        total_cards: 0,
        has_more: false,
        data: [],
      };
    }
    if (!response.ok) {
      // 5xx and other transport-level failures fall back to local.
      return null;
    }
    return await response.json();
  } catch {
    // Network error / abort / timeout — caller falls back to local.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const PAGE_SIZE = 175; // matches Scryfall's page size for compat

/**
 * Tries to answer a Scryfall-syntax query from the local catalog. Returns
 * null if the pattern isn't one we handle locally (caller falls back to API).
 */
async function tryLocalSearch(
  query: string,
  page: number,
  sortKey?: SearchSortKey,
  sortAsc?: boolean,
  unique: SearchUniqueMode = 'prints'
): Promise<ScryfallSearchResult | null> {
  const parsed = parseScryfallQuery(query);
  if (!parsed) return null;

  let results: ScryfallCard[] | null = null;

  if (parsed.name && parsed.setCode && parsed.collectorNumber) {
    const hit = await localFindCardByNameAndPrint(parsed.name, parsed.setCode, parsed.collectorNumber);
    results = hit ? [hit] : [];
  } else if (parsed.name && parsed.setCode) {
    results = await localFindPrintsByNameInSet(parsed.name, parsed.setCode);
  } else if (parsed.name && parsed.uniquePrints) {
    results = await localFindPrintsByName(parsed.name);
  } else if (parsed.name && parsed.exact) {
    const hit = await localFindCardByName(parsed.name);
    results = hit ? [hit] : [];
  } else if (parsed.freeText) {
    // Fetch up to 5000 matches in one shot, then paginate the in-memory
    // array below. The PAGE_SIZE cap was clamping users to 175 results
    // even when the universe had thousands (e.g. "sol" → 304 unique
    // arts on Scryfall).
    //
    // Routing by unique mode:
    //   - 'cards'  → collapse by oracle_id (one row per card concept).
    //   - 'art'    → collapse by illustration_id (one row per artwork)
    //                — Scryfall's default browse behavior, used by Search.
    //   - 'prints' → fall back to art-level for free text since there
    //                is no per-print free-text path locally.
    results = unique === 'cards'
      ? await localSearchByNameUniqueCards(parsed.freeText, 5000)
      : await localSearchByName(parsed.freeText, 5000);
  }

  if (!results) return null;

  if (sortKey) {
    sortLocalResults(results, sortKey, sortAsc ?? true);
  }

  // Paginate to match Scryfall's shape
  const start = (page - 1) * PAGE_SIZE;
  const slice = results.slice(start, start + PAGE_SIZE);
  return {
    object: 'list',
    total_cards: results.length,
    has_more: start + slice.length < results.length,
    data: slice,
  };
}

const RARITY_RANK: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  mythic: 3,
  special: 4,
  bonus: 4,
};

function priceNum(card: ScryfallCard): number | null {
  const raw = card.prices?.usd ?? card.prices?.usd_foil ?? card.prices?.usd_etched;
  if (!raw) return null;
  const n = parseFloat(raw);
  return isFinite(n) ? n : null;
}

/**
 * Compare two values such that nulls/undefined ALWAYS sort to the end,
 * regardless of ascending/descending direction. Used for sort keys
 * where "missing data" should never crowd the top of the list (price,
 * EDHREC rank).
 */
function nullsLast<T>(a: T | null | undefined, b: T | null | undefined, dir: 1 | -1, cmp: (a: T, b: T) => number): number {
  const aMissing = a == null;
  const bMissing = b == null;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  // dir is applied here so the natural compare flips, but the
  // missing-goes-last preference above is direction-independent.
  return cmp(a as T, b as T) * dir;
}

function sortLocalResults(results: ScryfallCard[], key: SearchSortKey, asc: boolean): void {
  const dir: 1 | -1 = asc ? 1 : -1;
  results.sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'name':
        cmp = a.name.localeCompare(b.name) * dir;
        break;
      case 'cmc':
        cmp = ((a.cmc ?? 0) - (b.cmc ?? 0)) * dir;
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
      case 'usd':
        cmp = nullsLast(priceNum(a), priceNum(b), dir, (x, y) => x - y);
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
      case 'color': {
        const ca = (a.color_identity ?? []).length;
        const cb = (b.color_identity ?? []).length;
        cmp = (ca - cb) * dir;
        if (cmp === 0) cmp = (a.color_identity ?? []).join('').localeCompare((b.color_identity ?? []).join('')) * dir;
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
      }
      case 'rarity':
        cmp = ((RARITY_RANK[a.rarity] ?? -1) - (RARITY_RANK[b.rarity] ?? -1)) * dir;
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
      case 'released':
        cmp = (a.released_at ?? '').localeCompare(b.released_at ?? '') * dir;
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
      case 'set': {
        cmp = (a.set ?? '').localeCompare(b.set ?? '') * dir;
        if (cmp === 0) {
          const na = parseInt(a.collector_number, 10);
          const nb = parseInt(b.collector_number, 10);
          if (!isNaN(na) && !isNaN(nb)) cmp = (na - nb) * dir;
          else cmp = (a.collector_number ?? '').localeCompare(b.collector_number ?? '') * dir;
        }
        break;
      }
      case 'edhrec':
        cmp = nullsLast(a.edhrec_rank ?? null, b.edhrec_rank ?? null, dir, (x, y) => x - y);
        // Match Scryfall's secondary ordering as closely as we can
        // without their internal tiebreaker: most recent set first,
        // then set code, then numeric collector number ASC, then
        // alphabetical. Mirrors the SQL ORDER BY in catalogQueries.
        if (cmp === 0) cmp = (b.released_at ?? '').localeCompare(a.released_at ?? '');
        if (cmp === 0) cmp = (a.set ?? '').localeCompare(b.set ?? '');
        if (cmp === 0) {
          const na = parseInt(a.collector_number, 10);
          const nb = parseInt(b.collector_number, 10);
          if (!isNaN(na) && !isNaN(nb)) cmp = na - nb;
          else cmp = (a.collector_number ?? '').localeCompare(b.collector_number ?? '');
        }
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
    }
    return cmp;
  });
}

type ParsedQuery = {
  name?: string;
  setCode?: string;
  collectorNumber?: string;
  exact?: boolean;
  uniquePrints?: boolean;
  freeText?: string;
};

function parseScryfallQuery(raw: string): ParsedQuery | null {
  const q = raw.trim();
  const parsed: ParsedQuery = {};

  // !"Card Name" — exact name match
  const exactMatch = q.match(/!"([^"]+)"/);
  if (exactMatch) {
    parsed.exact = true;
    parsed.name = exactMatch[1];
  }

  // set:CODE or s:CODE
  const setMatch = q.match(/\b(?:set|s):(\S+)/i);
  if (setMatch) parsed.setCode = setMatch[1].toLowerCase();

  // cn:NUMBER or number:NUMBER
  const cnMatch = q.match(/\b(?:cn|number):(\S+)/i);
  if (cnMatch) parsed.collectorNumber = cnMatch[1];

  // unique:prints
  if (/\bunique:prints\b/i.test(q)) parsed.uniquePrints = true;

  // If no structured bits matched, treat as free text search (only if no
  // scryfall-syntax-operators at all — otherwise give up and let the API handle it).
  const hasOperators = /[!:"]/g.test(q);
  if (!hasOperators) parsed.freeText = q;

  // If we got nothing actionable, signal unsupported.
  if (!parsed.name && !parsed.freeText) return null;

  return parsed;
}

/**
 * Get a single card by Scryfall ID.
 */
export async function getCard(scryfallId: string): Promise<ScryfallCard> {
  if (await isCatalogReady()) {
    const local = await localFindCardByScryfallId(scryfallId);
    if (local) return local;
  }
  const response = await fetch(`${BASE_URL}/cards/${scryfallId}`);
  if (!response.ok) {
    throw new Error(`Scryfall card error: ${response.status}`);
  }
  return response.json();
}

/**
 * Fetch all printings of the same card (same oracle_id).
 * Sorted by release date, newest first.
 */
export async function fetchPrints(oracleId: string): Promise<ScryfallCard[]> {
  if (await isCatalogReady()) {
    const local = await localFindPrintsByOracleId(oracleId);
    if (local.length > 0) return local;
  }
  const url = `${BASE_URL}/cards/search?q=${encodeURIComponent(`oracleid:${oracleId}`)}&unique=prints&order=released&dir=desc`;
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data: ScryfallSearchResult = await response.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}

export type ScryfallRuling = {
  source: string;
  published_at: string;
  comment: string;
};

export async function fetchRulings(scryfallId: string): Promise<ScryfallRuling[]> {
  const response = await fetch(`${BASE_URL}/cards/${scryfallId}/rulings`);
  if (!response.ok) return [];
  const data = await response.json();
  return data?.data ?? [];
}

/**
 * Get the image URI for a card, handling double-faced cards.
 * Falls back through other sizes if the requested size is missing
 * (e.g., some printings only ship `normal`/`large`).
 */
export function getCardImageUri(
  card: ScryfallCard,
  size: 'small' | 'normal' | 'large' | 'art_crop' = 'normal'
): string | undefined {
  const order: ('small' | 'normal' | 'large' | 'art_crop')[] =
    size === 'art_crop'
      ? ['art_crop', 'normal', 'large', 'small']
      : size === 'small'
      ? ['small', 'normal', 'large']
      : size === 'normal'
      ? ['normal', 'large', 'small']
      : ['large', 'normal', 'small'];

  const sources = [card.image_uris, card.card_faces?.[0]?.image_uris];
  for (const src of sources) {
    if (!src) continue;
    for (const s of order) {
      if (src[s]) return src[s];
    }
  }
  return undefined;
}

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format a USD amount with thousand separators (e.g. $1,171.29).
 * Accepts numbers or numeric strings; returns `—` for missing values.
 */
export function formatUSD(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(n)) return '—';
  return USD.format(n);
}

/** Legacy alias retained for back-compat with existing call sites. */
export function formatPrice(price?: string): string {
  return formatUSD(price);
}

/**
 * Best-effort display price for a card: prefers normal USD, then foil,
 * then etched. Returns the raw string so callers can pipe through
 * `formatUSD` themselves (or a custom format).
 */
export function pickAnyPrice(card: ScryfallCard): string | undefined {
  return card.prices?.usd ?? card.prices?.usd_foil ?? card.prices?.usd_etched;
}
