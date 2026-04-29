import { supabase } from './supabase.ts';

/**
 * Resolve EDHREC commander names to canonical Scryfall IDs against
 * the `cards` table that catalog-sync maintains.
 *
 * Constraints:
 *   - Only single-card commanders. Partner pairs (joined with " // ")
 *     are dropped — see project decision.
 *   - DFCs / split / adventure cards keep their canonical " // " name
 *     in Scryfall, so we try the full name first. If that misses, we
 *     fall back to the front face only (everything before " // ").
 *   - Order matters: the worker passes EDHREC's ranking and we
 *     preserve it in `Resolved[]` so consumers can rank rows directly.
 */
export type Resolved = {
  scryfall_id: string;
  rank: number;
  edhrec_slug: string | null;
};

export async function resolveCommanders(
  entries: Array<{ name: string; slug?: string }>
): Promise<Resolved[]> {
  // Three passes per entry, in order:
  //   1. Exact match on the EDHREC name. Catches every plain card.
  //   2. DFC fallback: catalog stores DFCs as "Front // Back" but
  //      EDHREC sends only "Front". A `name LIKE 'Front // %'`
  //      lookup picks them up.
  //   3. Front-face fallback for partner pairs ("X // Y") — try the
  //      first half as a single card. If it's a true partner pair,
  //      the front face exists as its own catalog row.
  //
  // We dedupe on scryfall_id to skip a commander that already
  // resolved at a higher rank (rare, but possible if EDHREC repeats
  // the same card in featured tiers).
  const want = entries.map((e, i) => ({
    rank: i + 1,
    name: e.name,
    slug: e.slug ?? null,
  }));
  if (want.length === 0) return [];

  // Pass 1: exact-name lookup.
  const fullNames = Array.from(new Set(want.map((w) => w.name)));
  const exactHits = await batchLookupByName(fullNames);

  // Pass 2: DFC lookup for plain (no " // ") names that missed exact.
  // We resolve via `name LIKE 'X // %'` and keep the first hit per
  // front. Partner pairs (with " // " in the EDHREC name) are NOT
  // run through this pass — they get the front-face pass below.
  const missingPlain = want.filter(
    (w) => !exactHits.has(w.name) && !w.name.includes(' // ')
  );
  const dfcHits =
    missingPlain.length > 0
      ? await batchLookupByFrontFacePrefix(
          Array.from(new Set(missingPlain.map((w) => w.name)))
        )
      : new Map<string, string>();

  // Pass 3: front-face fallback for partner pairs ("X // Y" → "X").
  const stillMissing = want.filter(
    (w) => !exactHits.has(w.name) && !dfcHits.has(w.name)
  );
  const frontMap = new Map<string, string>(); // entry name → front
  for (const w of stillMissing) {
    if (!w.name.includes(' // ')) continue;
    const front = w.name.split(' // ')[0]?.trim();
    if (front && front !== w.name) frontMap.set(w.name, front);
  }
  const frontNames = Array.from(new Set(frontMap.values()));
  const frontHits =
    frontNames.length > 0
      ? await batchLookupByName(frontNames)
      : new Map<string, string>();

  const seen = new Set<string>();
  const resolved: Resolved[] = [];
  for (const w of want) {
    const id =
      exactHits.get(w.name) ??
      dfcHits.get(w.name) ??
      (frontMap.has(w.name) ? frontHits.get(frontMap.get(w.name)!) : undefined);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    resolved.push({ scryfall_id: id, rank: w.rank, edhrec_slug: w.slug });
  }
  return resolved;
}

/**
 * Resolve a list of "front" names (no " // ") to catalog rows that
 * store them as the front face of a DFC ("Front // Back"). The
 * PostgREST `or` filter has fragile escaping rules around the LIKE
 * pattern's slashes/spaces, so we issue one `like` query per name
 * in parallel batches. Worst case is dozens of small queries per
 * run — well within the 5-day cadence budget and the round-trip
 * cost is dominated by the EDHREC fetch anyway.
 */
async function batchLookupByFrontFacePrefix(
  fronts: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (fronts.length === 0) return out;
  const CONCURRENCY = 8;
  for (let i = 0; i < fronts.length; i += CONCURRENCY) {
    const batch = fronts.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (front) => {
        const { data, error } = await supabase
          .from('cards')
          .select('scryfall_id, name')
          .like('name', `${front} // %`)
          .limit(1);
        if (error) {
          throw new Error(
            `DFC front-face lookup for "${front}" failed: ${error.message}`
          );
        }
        const row = (data ?? [])[0] as { scryfall_id?: string } | undefined;
        return { front, id: row?.scryfall_id };
      })
    );
    for (const r of results) {
      if (r.id && !out.has(r.front)) out.set(r.front, r.id);
    }
  }
  return out;
}

async function batchLookupByName(
  names: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (names.length === 0) return out;
  // Supabase's PostgREST IN filter handles a few hundred values
  // comfortably. We chunk at 200 to stay well within URL length.
  const CHUNK = 200;
  for (let i = 0; i < names.length; i += CHUNK) {
    const slice = names.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('cards')
      .select('scryfall_id, name')
      .in('name', slice);
    if (error) {
      throw new Error(`cards lookup failed: ${error.message}`);
    }
    for (const row of data ?? []) {
      const id = (row as { scryfall_id: string }).scryfall_id;
      const name = (row as { name: string }).name;
      // Keep the FIRST hit per name. Reprints share scryfall_id only
      // when they're the same printing — `name` collisions across
      // different printings resolve to whichever Postgres returns
      // first; the consumer treats scryfall_id as authoritative.
      if (id && name && !out.has(name)) out.set(name, id);
    }
  }
  return out;
}
