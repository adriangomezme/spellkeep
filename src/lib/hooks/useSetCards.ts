import { useEffect, useRef, useState } from 'react';
import { getCatalog } from '../catalog/catalogDb';
import { catalogRowInternals } from '../catalog/catalogQueries';
import type { ScryfallCard } from '../scryfall';

const { rowToScryfallCard } = catalogRowInternals;

/**
 * Loads every English-language card belonging to the given set from
 * the local catalog snapshot. Includes ALL layouts (tokens, emblems,
 * reversible cards, art_series) — unlike the global Search which
 * filters those out — because a set detail page is meant to mirror
 * Scryfall's full set listing.
 *
 * Sorted by numeric collector number so the natural set order is the
 * default. Consumers can re-sort downstream.
 */
export function useSetCards(code: string | undefined): {
  cards: ScryfallCard[];
  isReady: boolean;
} {
  const [cards, setCards] = useState<ScryfallCard[]>([]);
  const [isReady, setIsReady] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!code) {
      setCards([]);
      setIsReady(true);
      return;
    }
    setIsReady(false);
    void (async () => {
      const db = getCatalog();
      if (!db) {
        if (mounted.current) {
          setCards([]);
          setIsReady(true);
        }
        return;
      }
      try {
        const res = await db.execute(
          `SELECT * FROM cards
            WHERE set_code = ?
              AND lang = 'en'
            ORDER BY
              CAST(collector_number AS INTEGER) ASC,
              collector_number ASC`,
          [code.toLowerCase()]
        );
        const resRows: any = res?.rows;
        const length = resRows?.length ?? 0;
        const out: ScryfallCard[] = [];
        for (let i = 0; i < length; i++) {
          out.push(rowToScryfallCard(resRows.item(i)));
        }
        if (mounted.current) {
          setCards(out);
          setIsReady(true);
        }
      } catch {
        if (mounted.current) {
          setCards([]);
          setIsReady(true);
        }
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [code]);

  return { cards, isReady };
}
