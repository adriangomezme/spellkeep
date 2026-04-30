import { useEffect, useRef, useState } from 'react';
import { getCatalog } from '../catalog/catalogDb';

export type LocalSetInfo = {
  code: string;
  name: string;
  released_at: string | null;
  card_count: number | null;
  icon_svg_uri: string | null;
  /** Lowercased parent set code when this set is a child (token,
   *  promo, commander, alchemy, etc). null for root / standalone
   *  sets. May be missing on snapshots produced before the column
   *  was added — `useSetsParentMap` falls back to a Scryfall fetch
   *  in that window. */
  parent_set_code: string | null;
};

let cache: LocalSetInfo[] | null = null;
let inFlight: Promise<LocalSetInfo[]> | null = null;

async function loadSets(): Promise<LocalSetInfo[]> {
  if (cache) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const db = getCatalog();
    if (!db) return [];
    try {
      // `parent_set_code` was added to the snapshot schema after
      // catalog v1; older devices may not have it. Try the full
      // SELECT first, fall back without the column if SQLite errors.
      let resRows: any = null;
      try {
        const res = await db.execute(
          `SELECT code, name, released_at, card_count, icon_svg_uri, parent_set_code
             FROM sets
            ORDER BY released_at DESC`
        );
        resRows = res?.rows;
      } catch {
        const res = await db.execute(
          `SELECT code, name, released_at, card_count, icon_svg_uri
             FROM sets
            ORDER BY released_at DESC`
        );
        resRows = res?.rows;
      }

      // Local card counts per set. catalog-sync skips digital-only
      // printings (Arena Anthology, Historic Anthology, etc.), so
      // those sets still exist in `sets` with their Scryfall card
      // count but the local `cards` table has zero rows for them.
      // Joining against the actual count lets us:
      //   1. Hide sets that would render an empty grid on tap.
      //   2. Use the local count (instead of Scryfall's claim) so
      //      Sets Browser shows a number that matches reality —
      //      e.g. Mystical Archive renders as 126 (en + ja) instead
      //      of 63 once the lang='en' filter elsewhere is dropped.
      const localCounts = new Map<string, number>();
      try {
        const countRes = await db.execute(
          `SELECT set_code, COUNT(*) AS n FROM cards GROUP BY set_code`
        );
        const cRows: any = countRes?.rows;
        const cLen = cRows?.length ?? 0;
        for (let i = 0; i < cLen; i++) {
          const r = cRows.item(i);
          localCounts.set(String(r.set_code).toLowerCase(), Number(r.n));
        }
      } catch {
        // If the count query fails we leave localCounts empty and
        // fall through to the original card_count from sets — better
        // a stale count than a missing list.
      }

      const rows: LocalSetInfo[] = [];
      const length = resRows?.length ?? 0;
      for (let i = 0; i < length; i++) {
        const r = resRows.item(i);
        const code = (r.code as string).toLowerCase();
        const localN = localCounts.get(code);
        // Skip sets whose cards aren't in the local catalog at all
        // — opening them would just render an empty grid. Sets with
        // a count but no local rows include Arena Anthology, the
        // Historic / Explorer / Pioneer Anthologies, and other
        // digital-only product lines.
        if (localCounts.size > 0 && (localN === undefined || localN === 0)) {
          continue;
        }
        rows.push({
          code,
          name: r.name as string,
          released_at: r.released_at ?? null,
          // Prefer the local count when we have it so the number
          // matches what useSetCards actually renders.
          card_count:
            localN != null
              ? localN
              : r.card_count != null
                ? Number(r.card_count)
                : null,
          icon_svg_uri: r.icon_svg_uri ?? null,
          parent_set_code: r.parent_set_code ? String(r.parent_set_code).toLowerCase() : null,
        });
      }
      cache = rows;
      return rows;
    } catch {
      cache = [];
      return cache;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Returns the list of sets from the local catalog.db (Scryfall sets
 * table, refreshed nightly by the worker). Sorted newest first.
 * Hydrates lazily on first read; subsequent calls are synchronous via
 * the in-memory cache.
 */
export function useLocalSets(): LocalSetInfo[] {
  const [sets, setSets] = useState<LocalSetInfo[]>(cache ?? []);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (cache) return;
    void loadSets().then((rows) => {
      if (mounted.current) setSets(rows);
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  return sets;
}
