import { useEffect, useRef, useState } from 'react';
import { getCatalog } from '../catalog/catalogDb';
import { catalogRowInternals } from '../catalog/catalogQueries';
import type { ScryfallCard } from '../scryfall';

const { rowToScryfallCard } = catalogRowInternals;

const RECENT_WINDOW_DAYS = 540; // ~18 months — wide enough that even
//                                  during winter slow seasons there are
//                                  plenty of recent prints to surface.
const HIDDEN_LAYOUTS = `'art_series','token','double_faced_token','emblem','planar','scheme','vanguard'`;

let cache: ScryfallCard[] | null = null;
let inFlight: Promise<ScryfallCard[]> | null = null;

async function loadTrending(limit: number): Promise<ScryfallCard[]> {
  if (cache) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const db = getCatalog();
    if (!db) return [];
    try {
      const cutoff = new Date(Date.now() - RECENT_WINDOW_DAYS * 86400000)
        .toISOString()
        .slice(0, 10);
      // Pull a wider candidate pool than `limit` so the JS-side
      // dedup-by-oracle_id leaves enough survivors to fill the row.
      const res = await db.execute(
        `SELECT * FROM cards
          WHERE edhrec_rank IS NOT NULL
            AND lang = 'en'
            AND layout NOT IN (${HIDDEN_LAYOUTS})
            AND released_at >= ?
          ORDER BY edhrec_rank ASC
          LIMIT ?`,
        [cutoff, limit * 6]
      );
      const resRows: any = res?.rows;
      const length = resRows?.length ?? 0;
      const seen = new Set<string>();
      const out: ScryfallCard[] = [];
      for (let i = 0; i < length && out.length < limit; i++) {
        const card = rowToScryfallCard(resRows.item(i));
        if (!card.oracle_id || seen.has(card.oracle_id)) continue;
        seen.add(card.oracle_id);
        out.push(card);
      }
      cache = out;
      return out;
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
 * Returns the top EDHREC-ranked cards from the last ~18 months,
 * de-duped by oracle_id so the carousel doesn't show 5 versions of
 * the same printing. MVP "trending" — when telemetry lands we can
 * swap the source without touching the UI.
 */
export function useTrendingCards(limit = 12): ScryfallCard[] {
  const [cards, setCards] = useState<ScryfallCard[]>(cache ?? []);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (cache) return;
    void loadTrending(limit).then((rows) => {
      if (mounted.current) setCards(rows);
    });
    return () => {
      mounted.current = false;
    };
  }, [limit]);

  return cards;
}
