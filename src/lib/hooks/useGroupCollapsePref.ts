import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GroupBy } from './useGroupByPref';

// Per-binder + per-grouping persisted collapse set. Mirrors the rest
// of the local-first prefs:
//   - Per binder so reopening "Secret Lair" lands on the same vault
//     view you left.
//   - Per groupBy mode so switching mode doesn't carry the wrong
//     keys (a "set:khm" key has no meaning when grouping by rarity).
//
// Storage key: @spellkeep/group_collapse.{collectionId}.{groupBy}.v1
// Value: JSON-stringified array of group keys.
//
// `groupBy === 'none'` short-circuits to an empty set — there is no
// collapse semantics without grouping.

const VERSION = 'v1';

function key(collectionId: string, groupBy: GroupBy): string {
  return `@spellkeep/group_collapse.${collectionId}.${groupBy}.${VERSION}`;
}

export function useGroupCollapsePref(
  collectionId: string | null | undefined,
  groupBy: GroupBy,
): {
  collapsedKeys: Set<string>;
  setCollapsedKeys: (next: Set<string>) => void;
  toggleKey: (key: string) => void;
  isHydrated: boolean;
} {
  const [collapsedKeys, setCollapsedKeysState] = useState<Set<string>>(() => new Set());
  const [isHydrated, setIsHydrated] = useState(false);
  // Track the last (binder, mode) we wrote to. We use it to gate
  // persistence so the very first state we set after a mode change —
  // the empty Set during re-hydration — doesn't wipe the persisted
  // value of the *new* (binder, mode) pair.
  const lastTargetRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!collectionId || groupBy === 'none') {
      setCollapsedKeysState(new Set());
      setIsHydrated(true);
      lastTargetRef.current = null;
      return;
    }
    setIsHydrated(false);
    const target = key(collectionId, groupBy);
    AsyncStorage.getItem(target)
      .then((raw) => {
        if (!mounted) return;
        let next = new Set<string>();
        if (raw) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              next = new Set(arr.filter((k): k is string => typeof k === 'string'));
            }
          } catch {
            // Corrupt — treat as empty.
          }
        }
        setCollapsedKeysState(next);
        lastTargetRef.current = target;
        setIsHydrated(true);
      })
      .catch(() => {
        if (mounted) {
          lastTargetRef.current = target;
          setIsHydrated(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, [collectionId, groupBy]);

  const persist = useCallback(
    (next: Set<string>) => {
      if (!collectionId || groupBy === 'none') return;
      const target = key(collectionId, groupBy);
      // Skip until hydration finishes for this (binder, mode) — see
      // lastTargetRef comment above.
      if (lastTargetRef.current !== target) return;
      const arr = Array.from(next);
      if (arr.length === 0) {
        AsyncStorage.removeItem(target).catch((err) =>
          console.warn('[useGroupCollapsePref] remove failed', err),
        );
      } else {
        AsyncStorage.setItem(target, JSON.stringify(arr)).catch((err) =>
          console.warn('[useGroupCollapsePref] set failed', err),
        );
      }
    },
    [collectionId, groupBy],
  );

  const setCollapsedKeys = useCallback(
    (next: Set<string>) => {
      setCollapsedKeysState(next);
      persist(next);
    },
    [persist],
  );

  const toggleKey = useCallback(
    (k: string) => {
      setCollapsedKeysState((prev) => {
        const next = new Set(prev);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { collapsedKeys, setCollapsedKeys, toggleKey, isHydrated };
}
