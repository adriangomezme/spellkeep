import { useEffect, useRef, useState } from 'react';
import { getCatalog } from '../catalog/catalogDb';
import { catalogRowInternals } from '../catalog/catalogQueries';
import type { ScryfallCard } from '../scryfall';

const { rowToScryfallCard } = catalogRowInternals;

// Set types we treat as "real releases" worth highlighting. Excludes
// promo, memorabilia, secret_lair, etc. — they ship constantly and
// would dominate the carousel.
const FEATURED_SET_TYPES = `'expansion','core','draft_innovation','masters','commander'`;

const HIDDEN_LAYOUTS = `'art_series','token','double_faced_token','emblem','planar','scheme','vanguard'`;

type Result = {
  setCode: string | null;
  setName: string | null;
  releasedAt: string | null;
  cards: ScryfallCard[];
};

let cache: Result | null = null;
let inFlight: Promise<Result> | null = null;

async function loadLatest(limit: number): Promise<Result> {
  if (cache) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const db = getCatalog();
    if (!db) return { setCode: null, setName: null, releasedAt: null, cards: [] };
    try {
      const setRes = await db.execute(
        `SELECT code, name, released_at FROM sets
          WHERE set_type IN (${FEATURED_SET_TYPES})
            AND released_at IS NOT NULL
            AND released_at <= date('now')
          ORDER BY released_at DESC
          LIMIT 1`
      );
      const setRow: any = setRes?.rows?.item ? setRes.rows.item(0) : null;
      if (!setRow) {
        cache = { setCode: null, setName: null, releasedAt: null, cards: [] };
        return cache;
      }
      const code = (setRow.code as string).toLowerCase();
      // Top cards by EDHREC rank within the set, falling back to
      // collector_number for sets too new for EDHREC data.
      const cardRes = await db.execute(
        `SELECT * FROM cards
          WHERE set_code = ?
            AND lang = 'en'
            AND layout NOT IN (${HIDDEN_LAYOUTS})
          ORDER BY
            CASE WHEN edhrec_rank IS NULL THEN 1 ELSE 0 END,
            edhrec_rank ASC,
            CAST(collector_number AS INTEGER) ASC
          LIMIT ?`,
        [code, limit * 4]
      );
      const resRows: any = cardRes?.rows;
      const length = resRows?.length ?? 0;
      const seen = new Set<string>();
      const out: ScryfallCard[] = [];
      for (let i = 0; i < length && out.length < limit; i++) {
        const card = rowToScryfallCard(resRows.item(i));
        if (!card.oracle_id || seen.has(card.oracle_id)) continue;
        seen.add(card.oracle_id);
        out.push(card);
      }
      cache = {
        setCode: code,
        setName: setRow.name as string,
        releasedAt: setRow.released_at as string,
        cards: out,
      };
      return cache;
    } catch {
      cache = { setCode: null, setName: null, releasedAt: null, cards: [] };
      return cache;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Returns the most recently released "real" set (expansion / core /
 * masters / commander / draft innovation) plus its top cards by
 * EDHREC rank — the "latest releases" highlight reel for the Search
 * landing.
 */
export function useLatestSetCards(limit = 10): Result {
  const [data, setData] = useState<Result>(cache ?? { setCode: null, setName: null, releasedAt: null, cards: [] });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (cache) return;
    void loadLatest(limit).then((r) => {
      if (mounted.current) setData(r);
    });
    return () => {
      mounted.current = false;
    };
  }, [limit]);

  return data;
}
