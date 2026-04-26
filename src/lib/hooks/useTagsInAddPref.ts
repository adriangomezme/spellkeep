import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Global, per-device toggle. When ON, the Add-to-Collection flow
// surfaces a tag picker alongside the destination picker so the
// user can apply tags inline (and per-destination defaults kick in).
// Default OFF — tags stay an opt-in advanced feature for users who
// have built up a tag taxonomy.
//
// Storage key: @spellkeep/settings.tags_in_add.v1

const KEY = '@spellkeep/settings.tags_in_add.v1';

export function useTagsInAddPref(): {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  isHydrated: boolean;
} {
  const [enabled, setEnabledState] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!mounted) return;
        setEnabledState(raw === '1');
        setIsHydrated(true);
      })
      .catch(() => {
        if (mounted) setIsHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    if (next) {
      AsyncStorage.setItem(KEY, '1').catch((err) =>
        console.warn('[useTagsInAddPref] set failed', err),
      );
    } else {
      AsyncStorage.removeItem(KEY).catch((err) =>
        console.warn('[useTagsInAddPref] remove failed', err),
      );
    }
  }, []);

  return { enabled, setEnabled, isHydrated };
}
