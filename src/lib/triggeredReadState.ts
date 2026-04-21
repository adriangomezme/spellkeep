import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

// Timestamp of the most recent time the user opened the Triggered tab.
// Any price_alert_event with `at > readAt` counts as unread and feeds
// the badge on the Price Alerts insight chip.

const KEY = '@spellkeep/alerts_triggered_read_at.v1';

let current: string | null = null;
let hydrated = false;
const listeners = new Set<(v: string | null) => void>();

async function hydrate() {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    current = raw ?? null;
  } catch {}
  hydrated = true;
  listeners.forEach((l) => l(current));
}
// Warm the cache as soon as the module loads.
hydrate();

/** Reactive read of the "last read" timestamp. */
export function useTriggeredReadAt(): string | null {
  const [v, setV] = useState<string | null>(current);
  useEffect(() => {
    const cb = (nv: string | null) => setV(nv);
    listeners.add(cb);
    if (!hydrated) hydrate();
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return v;
}

/** Advance the cursor to now. Called when the user lands on the Triggered tab. */
export async function markTriggeredRead(): Promise<void> {
  const now = new Date().toISOString();
  current = now;
  try {
    await AsyncStorage.setItem(KEY, now);
  } catch {}
  listeners.forEach((l) => l(now));
}
