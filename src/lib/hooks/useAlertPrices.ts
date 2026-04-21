import { useEffect, useMemo, useRef, useState } from 'react';
import { batchResolveByScryfallId } from '../catalog/catalogQueries';
import { subscribePriceOverrides } from '../pricing/priceOverrides';
import type { Finish } from '../collection';

/**
 * Returns a Map<card_id, number | null> with the current market price for
 * each card+finish pair. Reads from the local catalog.db (snapshot merged
 * with price_overrides), so `refreshCollectionPrices` / worker snapshot
 * installs propagate automatically via subscribePriceOverrides.
 */
export function useAlertPrices(
  items: Array<{ card_id: string; finish: Finish }>
): Map<string, number | null> {
  const [prices, setPrices] = useState<Map<string, number | null>>(new Map());
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

    batchResolveByScryfallId(ids)
      .then((resolved) => {
        if (!mountedRef.current) return;
        const next = new Map<string, number | null>();
        for (const item of items) {
          const card = resolved.get(item.card_id);
          if (!card) {
            next.set(`${item.card_id}:${item.finish}`, null);
            continue;
          }
          const raw =
            item.finish === 'normal'
              ? card.prices?.usd
              : item.finish === 'foil'
                ? card.prices?.usd_foil
                : card.prices?.usd_etched;
          const parsed = raw ? parseFloat(raw) : NaN;
          next.set(
            `${item.card_id}:${item.finish}`,
            Number.isFinite(parsed) ? parsed : null
          );
        }
        setPrices(next);
      })
      .catch(() => {
        if (mountedRef.current) setPrices(new Map());
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
