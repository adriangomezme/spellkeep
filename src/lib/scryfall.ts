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
} from './catalog/catalogQueries';

const BASE_URL = 'https://api.scryfall.com';

export type ScryfallCard = {
  id: string;
  oracle_id: string;
  name: string;
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

/**
 * Search cards with full Scryfall query syntax.
 *
 * `unique=prints` returns every printing rather than collapsing by
 * oracle_id, so a search for "Lightning Bolt" surfaces all 80+
 * versions instead of just one.
 */
export async function searchCards(
  query: string,
  page = 1
): Promise<ScryfallSearchResult | null> {
  if (query.length < 2) return null;

  if (await isCatalogReady()) {
    const local = await tryLocalSearch(query, page);
    if (local) return local;
  }

  return fetchRemoteSearch(query, page);
}

async function fetchRemoteSearch(query: string, page: number): Promise<ScryfallSearchResult | null> {
  try {
    const response = await fetch(
      `${BASE_URL}/cards/search?q=${encodeURIComponent(query)}&page=${page}&unique=prints`
    );
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Scryfall search error: ${response.status}`);
    }
    return response.json();
  } catch {
    return null;
  }
}

const PAGE_SIZE = 175; // matches Scryfall's page size for compat

/**
 * Tries to answer a Scryfall-syntax query from the local catalog. Returns
 * null if the pattern isn't one we handle locally (caller falls back to API).
 */
async function tryLocalSearch(query: string, page: number): Promise<ScryfallSearchResult | null> {
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
    results = await localSearchByName(parsed.freeText, PAGE_SIZE);
  }

  if (!results) return null;

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
