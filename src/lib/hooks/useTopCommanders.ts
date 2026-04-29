import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@powersync/react';
import { db } from '../powersync/system';
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
    console.log(
      `[useTopCommanders] window=${window} powersync_rows=${ids.length}`
    );
    // One-shot diagnostic: count every row we have locally for the
    // table, regardless of window. Tells us at a glance whether the
    // PowerSync sync stream landed any data at all.
    if (ids.length === 0 && window === 'week') {
      void db
        .getAll<{ c: number; w: string | null }>(
          `SELECT COUNT(*) AS c, GROUP_CONCAT(DISTINCT time_window) AS w FROM top_commanders`
        )
        .then((rows) => {
          const r = rows?.[0];
          console.log(
            `[useTopCommanders] local_table_total=${r?.c ?? 'n/a'} windows=${r?.w ?? 'n/a'}`
          );
        })
        .catch((err) =>
          console.warn(`[useTopCommanders] local_table_probe_failed`, err)
        );
    }
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
        const missing: string[] = [];
        for (const id of ids) {
          const card = map.get(id);
          if (card) ordered.push(card);
          else missing.push(id);
        }
        console.log(
          `[useTopCommanders] window=${window} resolved=${ordered.length}/${ids.length}` +
            (missing.length > 0 ? ` missing_first=${missing.slice(0, 3).join(',')}` : '')
        );
        setCards(ordered);
      })
      .catch((err) => {
        console.warn(`[useTopCommanders] resolve failed`, err);
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
