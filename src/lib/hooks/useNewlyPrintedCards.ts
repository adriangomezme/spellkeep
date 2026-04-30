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

// Set types we treat as "real" newly-printed releases. Expansions /
// commander products / Modern Horizons-style draft innovations and
// starter products are what people mean when they say "what just
// came out". Everything else (promo packs, Mystical-Archive style
// masterpieces, Secret Lair memorabilia, art series, tokens, joke
// sets, alchemy-only digital releases) is filtered out — those
// dominate the recency sort otherwise and produce a feed full of
// Promo Pack stamps, Marvel borderless one-offs, and judge promos.
const ALLOWED_SET_TYPES = `'expansion','core','masters','commander','draft_innovation','starter','duel_deck','box'`;

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
      // The dedup-by-oracle-id step below keeps the FIRST occurrence
      // we encounter per oracle. We want that to be the canonical
      // black-bordered, non-promo, no-frame-effect print whenever a
      // card drops in multiple variants the same day (regular set
      // print vs. borderless / showcase / extended-art / Secret Lair
      // foil-only treatment). The CASE expression below ranks each
      // candidate as 0 (canonical) or 1 (variant) and breaks the tie
      // before edhrec_rank kicks in.
      //
      // We deliberately don't FILTER non-canonical prints out — if
      // a card only ships as a Secret Lair drop in this window, the
      // Secret Lair variant is the most-recent print and should
      // surface. The bias just ensures regular prints win when they
      // exist alongside variants.
      const res = await db.execute(
        `SELECT cards.*
           FROM cards
           JOIN sets ON sets.code = cards.set_code
          WHERE cards.released_at >= ?
            AND cards.lang = 'en'
            AND cards.layout NOT IN (${HIDDEN_LAYOUTS})
            AND (cards.type_line IS NULL OR cards.type_line NOT LIKE '%Basic Land%')
            AND sets.set_type IN (${ALLOWED_SET_TYPES})
            AND COALESCE(cards.promo, 0) = 0
          ORDER BY
            cards.released_at DESC,
            CASE
              WHEN COALESCE(cards.border_color, 'black') = 'black'
               AND (cards.frame_effects IS NULL OR cards.frame_effects = '[]')
               AND COALESCE(cards.full_art, 0) = 0
              THEN 0
              ELSE 1
            END ASC,
            CASE WHEN cards.edhrec_rank IS NULL THEN 1 ELSE 0 END,
            cards.edhrec_rank ASC
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
