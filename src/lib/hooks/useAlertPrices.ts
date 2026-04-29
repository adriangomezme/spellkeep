import { useEffect, useMemo, useRef, useState } from 'react';
import { batchResolvePricesByScryfallId } from '../catalog/catalogQueries';
import { subscribePriceOverrides } from '../pricing/priceOverrides';
import type { Finish } from '../collection';

/**
 * Module-level cache of resolved alert prices. Keyed by `${card_id}:${finish}`.
 * Lets subsequent mounts of /alerts hydrate instantly from memory while a
 * background refresh re-runs in the foreground. Cleared/refreshed when
 * price_overrides change, so staleness stays bounded.
 */
const priceCache = new Map<string, number | null>();

/**
 * Returns a Map<card_id:finish, number | null> with the current market price
 * for each card+finish pair. Reads only price columns from catalog.db (cheap
 * IN-query, no full ScryfallCard parse) and merges price_overrides.
 *
 * On mount, seeds from the module-level cache so re-entering /alerts shows
 * prices immediately. The async resolve still runs to refresh values, then
 * updates state once resolved.
 */
export function useAlertPrices(
  items: Array<{ card_id: string; finish: Finish }>
): Map<string, number | null> {
  const [prices, setPrices] = useState<Map<string, number | null>>(() => {
    const seed = new Map<string, number | null>();
    for (const item of items) {
      const k = priceKey(item.card_id, item.finish);
      if (priceCache.has(k)) seed.set(k, priceCache.get(k)!);
    }
    return seed;
  });
  const [tick, setTick] = useState(0);
  const mountedRef = useRef(true);

  // Refresh on any price override change so the row deltas stay current.
  useEffect(() => {
    const unsub = subscribePriceOverrides(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  // Stable signature — fire batch resolve only when the set of card_ids or
  // finishes actually changes, not on every parent re-render.
  const key = useMemo(
    () => items.map((i) => `${i.card_id}:${i.finish}`).sort().join('|'),
    [items]
  );

  useEffect(() => {
    mountedRef.current = true;
    const ids = Array.from(new Set(items.map((i) => i.card_id)));
    if (ids.length === 0) {
      setPrices(new Map());
      return () => {
        mountedRef.current = false;
      };
    }

    batchResolvePricesByScryfallId(ids)
      .then((resolved) => {
        const next = new Map<string, number | null>();
        for (const item of items) {
          const triplet = resolved.get(item.card_id);
          const k = priceKey(item.card_id, item.finish);
          if (!triplet) {
            next.set(k, null);
            priceCache.set(k, null);
            continue;
          }
          const v =
            item.finish === 'normal'
              ? triplet.usd
              : item.finish === 'foil'
                ? triplet.usd_foil
                : triplet.usd_etched;
          next.set(k, v);
          priceCache.set(k, v);
        }
        if (mountedRef.current) setPrices(next);
      })
      .catch(() => {
        // Keep previously-seeded prices on failure rather than blanking.
      });

    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  return prices;
}

export function priceKey(cardId: string, finish: Finish): string {
  return `${cardId}:${finish}`;
}
