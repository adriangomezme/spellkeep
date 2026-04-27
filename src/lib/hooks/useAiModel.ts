import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Per-device override for the AI model used by every AI feature in
// the app (search-nl now; future scan corrections, deck advice, etc).
//
// This is a temporary developer setting — the surface will be removed
// before launch and a single server-side default will replace it. The
// pub/sub keeps the value reactive across screens (Settings ↔ AI
// search sheet) without requiring a global store.

const KEY = '@spellkeep/dev_ai_model.v1';

let cache: string | null = null;
let inFlightLoad: Promise<string> | null = null;
const listeners = new Set<(model: string) => void>();

async function loadModel(): Promise<string> {
  if (cache !== null) return cache;
  if (inFlightLoad) return inFlightLoad;
  inFlightLoad = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      cache = (raw ?? '').trim();
      return cache;
    } catch {
      cache = '';
      return cache;
    } finally {
      inFlightLoad = null;
    }
  })();
  return inFlightLoad;
}

async function persist(value: string): Promise<void> {
  cache = value;
  try {
    if (value) await AsyncStorage.setItem(KEY, value);
    else await AsyncStorage.removeItem(KEY);
  } catch (err) {
    console.warn('[useAiModel] persist failed', err);
  }
}

function emit(value: string) {
  for (const fn of listeners) fn(value);
}

/**
 * Synchronous accessor for non-React contexts (e.g. one-shot fetches).
 * Returns the cached value if available, otherwise empty string —
 * callers fall back to the server default.
 */
export function getCurrentAiModel(): string {
  return cache ?? '';
}

export function useAiModel() {
  const [model, setModelState] = useState<string>(cache ?? '');
  const [isHydrated, setIsHydrated] = useState(cache !== null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    loadModel().then((loaded) => {
      if (!mounted.current) return;
      setModelState(loaded);
      setIsHydrated(true);
    });
    const sub = (next: string) => {
      if (mounted.current) setModelState(next);
    };
    listeners.add(sub);
    return () => {
      mounted.current = false;
      listeners.delete(sub);
    };
  }, []);

  const setModel = useCallback(async (next: string) => {
    const trimmed = next.trim();
    await persist(trimmed);
    emit(trimmed);
  }, []);

  const reset = useCallback(async () => {
    await persist('');
    emit('');
  }, []);

  return { model, isHydrated, setModel, reset };
}
