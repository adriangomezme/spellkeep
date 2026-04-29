import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AlertsSortKey =
  | 'created'
  | 'closest'
  | 'most_triggered'
  | 'recently_triggered';

export type AlertsSortPref = {
  key: AlertsSortKey;
  ascending: boolean;
};

const KEY = '@spellkeep/alerts_sort.v1';
const DEFAULT: AlertsSortPref = { key: 'created', ascending: false };

export function useAlertsSortPref() {
  const [sort, setSortState] = useState<AlertsSortPref>(DEFAULT);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (!mounted.current || !raw) return;
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === 'object' &&
          (parsed.key === 'created' ||
            parsed.key === 'closest' ||
            parsed.key === 'most_triggered' ||
            parsed.key === 'recently_triggered') &&
          typeof parsed.ascending === 'boolean'
        ) {
          setSortState(parsed);
        }
      } catch {
        // fall through to default
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  const setSort = useCallback((next: AlertsSortPref) => {
    setSortState(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  return { sort, setSort };
}
