import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Per-device "Quick Add" preference: the binder or list the card-detail
// footer shortcut writes to with one tap. AsyncStorage isn't reactive
// on its own, so we layer a tiny subscribe pattern on top so changing
// the target (from the action sheet or the long-press picker) updates
// every mounted consumer immediately.

const KEY = '@spellkeep/quick_add_target_id.v1';

let currentTarget: string | null | undefined = undefined; // undefined = not loaded yet
const listeners = new Set<(id: string | null) => void>();

async function load(): Promise<string | null> {
  if (currentTarget !== undefined) return currentTarget;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    currentTarget = raw;
  } catch {
    currentTarget = null;
  }
  return currentTarget;
}

function publish(next: string | null) {
  currentTarget = next;
  for (const fn of listeners) fn(next);
}

export async function getQuickAddTargetId(): Promise<string | null> {
  return load();
}

export async function setQuickAddTargetId(id: string | null): Promise<void> {
  try {
    if (id == null) await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, id);
  } catch (err) {
    console.warn('[quickAdd] write failed', err);
  }
  publish(id);
}

/**
 * Live value of the current Quick Add target. Returns `null` when the
 * user hasn't configured one yet, or when the stored id no longer
 * matches any local collection (caller is responsible for that check).
 */
export function useQuickAddTargetId(): string | null {
  const [id, setId] = useState<string | null>(
    currentTarget === undefined ? null : currentTarget
  );

  useEffect(() => {
    let cancelled = false;
    load().then((v) => {
      if (!cancelled) setId(v);
    });
    const handler = (v: string | null) => setId(v);
    listeners.add(handler);
    return () => {
      cancelled = true;
      listeners.delete(handler);
    };
  }, []);

  return id;
}

/**
 * Pick the best finish for a Quick Add given a card's available prints.
 *   1. If Scryfall lists finishes, prefer nonfoil → foil → etched.
 *   2. Else infer from price columns (which mirror finishes in practice).
 *   3. Else fall back to 'normal'.
 */
export function pickQuickAddFinish(card: {
  finishes?: string[];
  prices?: { usd?: string; usd_foil?: string; usd_etched?: string };
}): 'normal' | 'foil' | 'etched' {
  const fins = card.finishes ?? [];
  if (fins.length > 0) {
    if (fins.includes('nonfoil')) return 'normal';
    if (fins.includes('foil')) return 'foil';
    if (fins.includes('etched')) return 'etched';
  }
  if (card.prices?.usd) return 'normal';
  if (card.prices?.usd_foil) return 'foil';
  if (card.prices?.usd_etched) return 'etched';
  return 'normal';
}
