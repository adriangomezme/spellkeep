import { supabase } from './supabase.ts';

/**
 * Resolve EDHREC commander names to canonical Scryfall IDs against
 * the `cards` table that catalog-sync maintains.
 *
 * Constraints:
 *   - Only single-card commanders. Partner pairs (joined with " // ")
 *     drop the second face and resolve via the first.
 *   - DFCs / split / adventure cards keep their canonical " // " name
 *     in Scryfall, so we try the full name first. If that misses, we
 *     fall back to a `name LIKE 'Front // %'` lookup that catches
 *     DFCs the catalog stores under their full canonical name.
 *   - PRINT QUALITY: when a name has multiple printings (regular set
 *     + Secret Lair art card + showcase + extended-art + ...), we
 *     pick the cleanest "normal" art so the carousel doesn't render
 *     art-only cards or showcase variants. The tiering function
 *     prefers `layout=normal/transform/...`, English, non-promo,
 *     no special frame_effects, then most-recent release.
 *   - Order matters: the worker passes EDHREC's ranking and we
 *     preserve it in `Resolved[]` so consumers can rank rows directly.
 */
export type Resolved = {
  scryfall_id: string;
  rank: number;
  edhrec_slug: string | null;
};

type CardRow = {
  scryfall_id: string;
  name: string;
  layout: string | null;
  lang: string | null;
  promo: boolean | null;
  frame_effects: string | null; // serialized JSON array
  released_at: string | null;
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

const SPECIAL_FRAME_EFFECTS = new Set([
  'extendedart',
  'showcase',
  'borderless',
  'inverted',
]);

export async function resolveCommanders(
  entries: Array<{ name: string; slug?: string }>
): Promise<Resolved[]> {
  const want = entries.map((e, i) => ({
    rank: i + 1,
    name: e.name,
    slug: e.slug ?? null,
  }));
  if (want.length === 0) return [];

  // Pass 1: exact-name lookup with print-quality picker.
  const fullNames = Array.from(new Set(want.map((w) => w.name)));
  const exactHits = await pickBestPrintByName(fullNames);

  // Pass 2: DFC lookup for plain names that missed exact match.
  const missingPlain = want.filter(
    (w) => !exactHits.has(w.name) && !w.name.includes(' // ')
  );
  const dfcHits =
    missingPlain.length > 0
      ? await pickBestDfcFront(
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
      ? await pickBestPrintByName(frontNames)
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
 * For each requested name, fetch every English non-art-card printing
 * and choose the one with the most "normal" art (lowest preference
 * tier; latest release as tiebreaker).
 */
async function pickBestPrintByName(
  names: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (names.length === 0) return out;
  const CHUNK = 200;
  for (let i = 0; i < names.length; i += CHUNK) {
    const slice = names.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('cards')
      .select('scryfall_id, name, layout, lang, promo, frame_effects, released_at')
      .in('name', slice)
      .eq('lang', 'en');
    if (error) {
      throw new Error(`cards lookup failed: ${error.message}`);
    }
    rankAndStore(out, (data ?? []) as CardRow[], (r) => r.name);
  }
  return out;
}

/**
 * Resolve a list of "front" names (no " // ") to catalog rows that
 * store them as the front face of a DFC ("Front // Back"). One
 * `LIKE` per name (parallel batches), each returning all printings —
 * we then apply the same print-quality tiering as the exact-match
 * path so DFCs don't pull art-card variants either.
 */
async function pickBestDfcFront(
  fronts: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (fronts.length === 0) return out;
  const CONCURRENCY = 6;
  for (let i = 0; i < fronts.length; i += CONCURRENCY) {
    const batch = fronts.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (front) => {
        const { data, error } = await supabase
          .from('cards')
          .select('scryfall_id, name, layout, lang, promo, frame_effects, released_at')
          .like('name', `${front} // %`)
          .eq('lang', 'en');
        if (error) {
          throw new Error(
            `DFC front-face lookup for "${front}" failed: ${error.message}`
          );
        }
        return { front, rows: (data ?? []) as CardRow[] };
      })
    );
    for (const r of results) {
      // Tier and pick using the front (the EDHREC-side name) as the
      // map key, regardless of the catalog's full "X // Y" name.
      const local = new Map<string, string>();
      rankAndStore(local, r.rows, () => r.front);
      const id = local.get(r.front);
      if (id && !out.has(r.front)) out.set(r.front, id);
    }
  }
  return out;
}

/**
 * Group rows by `keyOf(row)`, then for each key pick the row with
 * the lowest preference tier (best "normal" art), breaking ties by
 * latest release. Rows with skip-list layouts are dropped entirely.
 */
function rankAndStore(
  out: Map<string, string>,
  rows: CardRow[],
  keyOf: (r: CardRow) => string
): void {
  const grouped = new Map<string, CardRow[]>();
  for (const r of rows) {
    if (r.layout && SKIP_LAYOUTS.has(r.layout)) continue;
    const key = keyOf(r);
    const list = grouped.get(key) ?? [];
    list.push(r);
    grouped.set(key, list);
  }
  for (const [key, list] of grouped) {
    if (out.has(key)) continue;
    list.sort((a, b) => {
      const ta = preferenceTier(a);
      const tb = preferenceTier(b);
      if (ta !== tb) return ta - tb;
      const ra = a.released_at ?? '';
      const rb = b.released_at ?? '';
      return ra > rb ? -1 : ra < rb ? 1 : 0;
    });
    const best = list[0];
    if (best?.scryfall_id) out.set(key, best.scryfall_id);
  }
}

/** Lower is better. Hard penalties for promos/special frames so the
 * carousel always prefers the regular set printing when one exists. */
function preferenceTier(r: CardRow): number {
  let tier = 0;
  if (r.promo) tier += 5;
  const fx = parseFrameEffects(r.frame_effects);
  if (fx.some((f) => SPECIAL_FRAME_EFFECTS.has(f))) tier += 3;
  return tier;
}

function parseFrameEffects(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
