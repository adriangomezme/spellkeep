import { supabase } from './supabase.ts';

/**
 * Resolve EDHREC commander entries to canonical Scryfall IDs.
 *
 * EDHREC's `.json` payload includes an `id` field per cardview that is
 * already the canonical Scryfall ID of the printing they feature on
 * the page — exactly the print whose art we want to mirror in the
 * carousel. So the resolver becomes a pass-through: validate that
 * each id exists in our local `cards` catalog, drop anything we
 * wouldn't want to render (art series, tokens, emblems, etc.), and
 * preserve the EDHREC ranking.
 *
 * No name matching, no DFC fallback, no "best printing" tier — those
 * heuristics produced wrong picks (Sephiroth → art card, Edgar Markov
 * → wrong showcase) because we were second-guessing EDHREC's own
 * choice of which art to feature.
 */
export type Resolved = {
  scryfall_id: string;
  rank: number;
  edhrec_slug: string | null;
};

const SKIP_LAYOUTS = new Set([
  'art_series',
  'token',
  'double_faced_token',
  'emblem',
  'planar',
  'scheme',
  'vanguard',
  'reversible_card',
  'minigame',
]);

export async function resolveCommanders(
  entries: Array<{ id: string; name: string; slug?: string }>
): Promise<Resolved[]> {
  if (entries.length === 0) return [];

  // Fetch + validate every requested Scryfall ID against the catalog.
  // The query returns each id we should render — anything filtered
  // out by SKIP_LAYOUTS or simply missing falls out of the set.
  const wantedIds = Array.from(new Set(entries.map((e) => e.id)));
  const valid = await fetchValidScryfallIds(wantedIds);

  const seen = new Set<string>();
  const resolved: Resolved[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (!valid.has(e.id) || seen.has(e.id)) continue;
    seen.add(e.id);
    resolved.push({
      scryfall_id: e.id,
      rank: i + 1,
      edhrec_slug: e.slug ?? null,
    });
  }
  return resolved;
}

async function fetchValidScryfallIds(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (ids.length === 0) return out;
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('cards')
      .select('scryfall_id, layout')
      .in('scryfall_id', slice);
    if (error) {
      throw new Error(`cards lookup failed: ${error.message}`);
    }
    for (const row of data ?? []) {
      const id = (row as { scryfall_id?: string }).scryfall_id;
      const layout = (row as { layout?: string | null }).layout ?? null;
      if (!id) continue;
      if (layout && SKIP_LAYOUTS.has(layout)) continue;
      out.add(id);
    }
  }
  return out;
}
