import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSets } from './useLocalSets';
import { getSetsParentMap, getCachedSetsParentMap } from '../search/setsHierarchy';

/**
 * Returns `code → parent_set_code` for every set known to the app.
 *
 * Source preference:
 *   1. The local `catalog.db` snapshot — once the worker ships a
 *      snapshot with `parent_set_code` populated, this is the only
 *      source we need (offline-friendly, no extra network).
 *   2. Scryfall `/sets` — fallback for the transition window where
 *      a user's installed snapshot still predates the column. Cached
 *      a week in AsyncStorage; cleared automatically once the local
 *      catalog has the data.
 */
export function useSetsParentMap(): Map<string, string | null> {
  const sets = useLocalSets();

  // Map built from the local snapshot. If at least one set carries a
  // parent_set_code, we trust the snapshot wholesale (children w/o a
  // parent in this view are genuinely roots).
  const localMap = useMemo(() => {
    const m = new Map<string, string | null>();
    let sawParent = false;
    for (const s of sets) {
      m.set(s.code, s.parent_set_code);
      if (s.parent_set_code) sawParent = true;
    }
    return sawParent ? m : null;
  }, [sets]);

  const cachedRemote = getCachedSetsParentMap();
  const [remoteMap, setRemoteMap] = useState<Map<string, string | null> | null>(cachedRemote);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    // Skip the network call when local already has the data — keeps
    // offline users self-sufficient and avoids needless rate-limit
    // exposure to Scryfall.
    if (localMap) return;
    if (cachedRemote) return;
    void getSetsParentMap().then((resolved) => {
      if (mounted.current) setRemoteMap(resolved);
    });
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localMap]);

  return localMap ?? remoteMap ?? new Map();
}
