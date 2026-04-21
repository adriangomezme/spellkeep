import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AlertsViewMode = 'flat' | 'grouped';

const KEY = '@spellkeep/alerts_view_mode.v1';
const DEFAULT: AlertsViewMode = 'grouped';

export function useAlertsViewMode() {
  const [viewMode, setViewModeState] = useState<AlertsViewMode>(DEFAULT);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (mounted.current && (raw === 'flat' || raw === 'grouped')) {
          setViewModeState(raw);
        }
      } catch {
        // fall through to default
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  const setViewMode = useCallback((mode: AlertsViewMode) => {
    setViewModeState(mode);
    AsyncStorage.setItem(KEY, mode).catch(() => {});
  }, []);

  return { viewMode, setViewMode };
}
