import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@powersync/react';
import { batchResolveByScryfallId } from '../catalog/catalogQueries';
import type { ScryfallCard } from '../scryfall';

/**
 * Top Commanders feed sourced from EDHREC and persisted in the
 * `top_commanders` Supabase table by the `commander-sync` worker.
 * The table syncs to the device via PowerSync; this hook reads it
 * locally, resolves each `scryfall_id` against `catalog.db`, and
 * returns ranked `ScryfallCard[]` for the carousel to render.
 *
 * The Search hub shows 30 per window; we cap at 50 here so consumers
 * with a different layout can pull more without re-querying.
 */
export type CommanderWindow = 'week' | 'month' | 'two-years';

type TopCommanderRow = {
  scryfall_id: string;
  rank: number;
};

export function useTopCommanders(
  window: CommanderWindow,
  limit = 30
): { cards: ScryfallCard[]; isLoading: boolean } {
  const { data: rows } = useQuery<TopCommanderRow>(
    `SELECT scryfall_id, rank
       FROM top_commanders
      WHERE time_window = ?
      ORDER BY rank ASC
      LIMIT ?`,
    [window, limit]
  );

  const ids = useMemo(() => (rows ?? []).map((r) => r.scryfall_id), [rows]);
  const idsKey = useMemo(() => ids.join('|'), [ids]);

  const [cards, setCards] = useState<ScryfallCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (ids.length === 0) {
      setCards([]);
      setIsLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }
    setIsLoading(true);
    batchResolveByScryfallId(ids)
      .then((map) => {
        if (!mountedRef.current) return;
        // Preserve the rank ordering — Map iteration follows insertion
        // order which doesn't match our incoming `ids` after the SQL
        // shuffle, so we walk `ids` and pull from the map.
        const ordered: ScryfallCard[] = [];
        for (const id of ids) {
          const card = map.get(id);
          if (card) ordered.push(card);
        }
        setCards(ordered);
      })
      .catch(() => {
        if (mountedRef.current) setCards([]);
      })
      .finally(() => {
        if (mountedRef.current) setIsLoading(false);
      });
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return { cards, isLoading };
}
