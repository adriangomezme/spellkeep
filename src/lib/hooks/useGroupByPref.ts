import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Per-binder Group By selection. Persists per device — a binder
// the user organizes by Set on one device stays grouped by Set
// only on that device. Coherent with viewMode and cardsPerRow,
// which are also per-device.
//
// Key: @spellkeep/group_by.{collectionId}.v1
//
// Why per-binder: a deck is naturally browsed by Type, a vault by
// Set, a wishlist by Color. A single global preference would
// constantly need toggling.

export type GroupBy =
  | 'none'
  | 'rarity'
  | 'set'
  | 'color'
  | 'type'
  | 'tags';

export const GROUP_BY_DEFAULT: GroupBy = 'none';

const VALID = new Set<GroupBy>([
  'none',
  'rarity',
  'set',
  'color',
  'type',
  'tags',
]);

function key(collectionId: string): string {
  return `@spellkeep/group_by.${collectionId}.v1`;
}

export function useGroupByPref(collectionId: string | null | undefined): {
  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;
  isHydrated: boolean;
} {
  const [groupBy, setGroupByState] = useState<GroupBy>(GROUP_BY_DEFAULT);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!collectionId) {
      setIsHydrated(true);
      return;
    }
    AsyncStorage.getItem(key(collectionId))
      .then((raw) => {
        if (!mounted) return;
        if (raw && VALID.has(raw as GroupBy)) {
          setGroupByState(raw as GroupBy);
        } else {
          setGroupByState(GROUP_BY_DEFAULT);
        }
        setIsHydrated(true);
      })
      .catch(() => {
        if (mounted) setIsHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, [collectionId]);

  const setGroupBy = useCallback(
    (g: GroupBy) => {
      setGroupByState(g);
      if (!collectionId) return;
      if (g === GROUP_BY_DEFAULT) {
        AsyncStorage.removeItem(key(collectionId)).catch((err) =>
          console.warn('[useGroupByPref] remove failed', err),
        );
      } else {
        AsyncStorage.setItem(key(collectionId), g).catch((err) =>
          console.warn('[useGroupByPref] set failed', err),
        );
      }
    },
    [collectionId],
  );

  return { groupBy, setGroupBy, isHydrated };
}
