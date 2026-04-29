import { config } from './config.ts';

/**
 * EDHREC publishes its data by appending `.json` to any URL — an
 * unofficial but well-known endpoint that returns the same payload
 * the SSR'd page consumes. The shape is deeply nested; the bit we
 * care about is `container.json_dict.cardlists[0].cardviews`.
 */
export type CommanderWindow = 'week' | 'month' | 'two-years';

export type RawEdhrecCommander = {
  /** Canonical Scryfall ID of the specific printing EDHREC features.
   *  Treat this as authoritative — they pick the print whose art is
   *  the page hero, so reusing it keeps our carousel art consistent
   *  with EDHREC's own display. */
  id: string;
  /** EDHREC's display name. May be a partner pair joined by " // ". */
  name: string;
  /** URL slug — e.g. "atraxa-praetors-voice". */
  sanitized?: string;
  /** Image URL (Scryfall mirror) — we don't use it; the catalog wins. */
  image?: string;
  num_decks?: number;
  potential_decks?: number;
};

// EDHREC's data backend lives on the `json.edhrec.com` host — appending
// `.json` to the public site URL returns the SSR'd HTML. The `pages/`
// prefix mirrors the Next.js page route the live site consumes.
// EDHREC's data backend lives on the `json.edhrec.com` host — the
// public `.json` URL on edhrec.com returns the SSR'd HTML. Note the
// /year.json suffix for the all-time/two-year list: that's the
// canonical name in EDHREC's schema (root /commanders.json is 403).
const URLS: Record<CommanderWindow, string> = {
  week: 'https://json.edhrec.com/pages/commanders/week.json',
  month: 'https://json.edhrec.com/pages/commanders/month.json',
  'two-years': 'https://json.edhrec.com/pages/commanders/year.json',
};

export async function fetchTopCommanders(
  window: CommanderWindow,
  limit: number
): Promise<RawEdhrecCommander[]> {
  const url = URLS[window];
  const res = await fetch(url, {
    headers: { 'user-agent': config.userAgent, accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`EDHREC ${window} fetch failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as unknown;
  const list = extractCardviews(body);
  if (list.length === 0) {
    throw new Error(`EDHREC ${window}: empty cardviews in response`);
  }
  return list.slice(0, limit);
}

/**
 * Defensive parser — EDHREC's payload schema has shifted historically;
 * we walk to `container.json_dict.cardlists[*].cardviews` and merge
 * every list's cards (the page sometimes splits the top into "Past
 * week" + featured tiers). Skip anything that doesn't look like a
 * commander entry.
 */
function extractCardviews(body: unknown): RawEdhrecCommander[] {
  if (!body || typeof body !== 'object') return [];
  const container = (body as Record<string, unknown>).container;
  if (!container || typeof container !== 'object') return [];
  const jsonDict = (container as Record<string, unknown>).json_dict;
  if (!jsonDict || typeof jsonDict !== 'object') return [];
  const cardlists = (jsonDict as Record<string, unknown>).cardlists;
  if (!Array.isArray(cardlists)) return [];

  const out: RawEdhrecCommander[] = [];
  for (const list of cardlists) {
    if (!list || typeof list !== 'object') continue;
    const views = (list as Record<string, unknown>).cardviews;
    if (!Array.isArray(views)) continue;
    for (const v of views) {
      if (!v || typeof v !== 'object') continue;
      const obj = v as Record<string, unknown>;
      const id = obj.id;
      const name = obj.name;
      if (typeof id !== 'string' || id.length === 0) continue;
      if (typeof name !== 'string' || name.length === 0) continue;
      out.push({
        id,
        name,
        sanitized: typeof obj.sanitized === 'string' ? obj.sanitized : undefined,
        image: typeof obj.image === 'string' ? obj.image : undefined,
        num_decks: typeof obj.num_decks === 'number' ? obj.num_decks : undefined,
        potential_decks:
          typeof obj.potential_decks === 'number' ? obj.potential_decks : undefined,
      });
    }
  }
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
