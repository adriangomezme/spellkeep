import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Per-device toggle. When ON (default), the Collection hub renders the
// market stats block (Total Value · Top Card · 30D trend) inside the
// header card. AsyncStorage isn't reactive — we layer a tiny pub/sub on
// top so flipping the toggle in Profile updates the Collection hub
// immediately, without needing a remount.
//
// Storage key: @spellkeep/settings.market_header.v1

const KEY = '@spellkeep/settings.market_header.v1';

let current: boolean | undefined = undefined; // undefined = not loaded yet
const listeners = new Set<(v: boolean) => void>();

async function load(): Promise<boolean> {
  if (current !== undefined) return current;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    current = raw !== '0'; // default ON: only explicit "0" disables
  } catch {
    current = true;
  }
  return current;
}

function publish(next: boolean) {
  current = next;
  for (const fn of listeners) fn(next);
}

export async function setMarketHeaderEnabled(next: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, next ? '1' : '0');
  } catch (err) {
    console.warn('[useMarketHeaderPref] write failed', err);
  }
  publish(next);
}

export function useMarketHeaderPref(): {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  isHydrated: boolean;
} {
  const [enabled, setEnabledState] = useState<boolean>(
    current === undefined ? true : current
  );
  const [isHydrated, setIsHydrated] = useState(current !== undefined);

  useEffect(() => {
    let cancelled = false;
    load().then((v) => {
      if (cancelled) return;
      setEnabledState(v);
      setIsHydrated(true);
    });
    const handler = (v: boolean) => setEnabledState(v);
    listeners.add(handler);
    return () => {
      cancelled = true;
      listeners.delete(handler);
    };
  }, []);

  return {
    enabled,
    setEnabled: (next: boolean) => {
      void setMarketHeaderEnabled(next);
    },
    isHydrated,
  };
}
