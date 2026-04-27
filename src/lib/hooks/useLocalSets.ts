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
      const rows: LocalSetInfo[] = [];
      const length = resRows?.length ?? 0;
      for (let i = 0; i < length; i++) {
        const r = resRows.item(i);
        rows.push({
          code: (r.code as string).toLowerCase(),
          name: r.name as string,
          released_at: r.released_at ?? null,
          card_count: r.card_count != null ? Number(r.card_count) : null,
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
