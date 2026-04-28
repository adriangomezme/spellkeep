import { useEffect, useRef, useState } from 'react';
import { getCatalog } from '../catalog/catalogDb';
import { catalogRowInternals } from '../catalog/catalogQueries';
import type { ScryfallCard } from '../scryfall';

const { rowToScryfallCard } = catalogRowInternals;

/**
 * Window for "newly printed". Scryfall ships something almost every
 * week — Secret Lairs, promo packs, anniversary editions, regular
 * sets — so 45 days is plenty wide to keep the list populated even
 * during slow stretches without diluting the "fresh" feeling.
 */
const RECENT_WINDOW_DAYS = 45;

const HIDDEN_LAYOUTS = `'art_series','token','double_faced_token','emblem','planar','scheme','vanguard'`;

export type NewlyPrintedResult = {
  cards: ScryfallCard[];
  /** Earliest release date in the result set, used for the section
   *  subtitle ("Cards from the last 45 days · since Mar 13"). */
  windowStart: string;
};

let cache: NewlyPrintedResult | null = null;
let inFlight: Promise<NewlyPrintedResult> | null = null;

async function load(limit: number): Promise<NewlyPrintedResult> {
  if (cache) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const db = getCatalog();
    if (!db) return { cards: [], windowStart: '' };
    try {
      const cutoff = new Date(Date.now() - RECENT_WINDOW_DAYS * 86400000)
        .toISOString()
        .slice(0, 10);
      // Pull a wider candidate pool than `limit` so dedup-by-oracle_id
      // leaves enough survivors to fill the row. We also exclude
      // basic lands — they get reprinted every set and would dominate
      // the list otherwise. The ordering keeps newer prints first
      // (recency is the main signal) with EDHREC popularity as a
      // tiebreaker so when 30 cards drop the same day we surface the
      // ones people actually care about.
      const res = await db.execute(
        `SELECT * FROM cards
          WHERE released_at >= ?
            AND lang = 'en'
            AND layout NOT IN (${HIDDEN_LAYOUTS})
            AND (type_line IS NULL OR type_line NOT LIKE '%Basic Land%')
          ORDER BY
            released_at DESC,
            CASE WHEN edhrec_rank IS NULL THEN 1 ELSE 0 END,
            edhrec_rank ASC
          LIMIT ?`,
        [cutoff, limit * 8]
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
      cache = { cards: out, windowStart: cutoff };
      return cache;
    } catch {
      cache = { cards: [], windowStart: '' };
      return cache;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Cards printed in the last ~45 days, across ALL set types — sets,
 * Secret Lairs, promo packs, anniversary editions. Replaces the older
 * "Latest release" carousel that was scoped to a single set and ended
 * up showing the same Commander reprints every time.
 */
export function useNewlyPrintedCards(limit = 12): NewlyPrintedResult {
  const [data, setData] = useState<NewlyPrintedResult>(
    cache ?? { cards: [], windowStart: '' }
  );
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (cache) return;
    void load(limit).then((r) => {
      if (mounted.current) setData(r);
    });
    return () => {
      mounted.current = false;
    };
  }, [limit]);

  return data;
}
