import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Tracks when we last wiped the local DB for a user change. The
// FirstSyncGate stays visible until PowerSync reports a
// `lastSyncedAt` strictly greater than this timestamp — i.e. at
// least one full sync pass has completed since the wipe.
//
// We use a timestamp (not a boolean flag) because PowerSync does not
// reset `hasSynced` on `disconnect()` — it stays true from the
// previous session, so a boolean flag alone can't distinguish "never
// synced for this user" from "synced long ago for someone else".
//
// Persisted so an app crash mid-sync still gates the splash on
// relaunch until the sync completes.

const KEY = '@spellkeep/sync_reset_at.v1';

const listeners = new Set<(value: number | null) => void>();

export async function getSyncResetAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function markSyncReset(): Promise<void> {
  const now = Date.now();
  try {
    await AsyncStorage.setItem(KEY, String(now));
  } catch (err) {
    console.warn('[syncResetAt] set failed', err);
  }
  for (const l of listeners) l(now);
}

export async function clearSyncReset(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (err) {
    console.warn('[syncResetAt] clear failed', err);
  }
  for (const l of listeners) l(null);
}

/**
 * Hydrates from AsyncStorage on mount and subscribes to changes.
 * Returns the timestamp (ms) of the last wipe, or null if none
 * pending. Consumers compare against `status.lastSyncedAt` to decide
 * whether to show the splash.
 */
export function useSyncResetAt(): number | null {
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    getSyncResetAt().then((v) => {
      if (mounted) setValue(v);
    });
    const listener = (v: number | null) => {
      if (mounted) setValue(v);
    };
    listeners.add(listener);
    return () => {
      mounted = false;
      listeners.delete(listener);
    };
  }, []);

  return value;
}
