import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ScryfallCard } from '../scryfall';

const KEY = '@spellkeep/recently_viewed_cards.v1';
const MAX_ITEMS = 20;

export type RecentCard = {
  id: string;
  name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  image_uri_small?: string;
  price_usd?: string;
  viewed_at: number;
};

let inFlightLoad: Promise<RecentCard[]> | null = null;
let cache: RecentCard[] | null = null;
const subscribers = new Set<(items: RecentCard[]) => void>();

function notify() {
  if (cache == null) return;
  for (const cb of subscribers) cb(cache);
}

async function loadFromStorage(): Promise<RecentCard[]> {
  if (cache) return cache;
  if (inFlightLoad) return inFlightLoad;
  inFlightLoad = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as RecentCard[]) : [];
      cache = Array.isArray(parsed) ? parsed : [];
      return cache;
    } catch {
      cache = [];
      return cache;
    } finally {
      inFlightLoad = null;
    }
  })();
  return inFlightLoad;
}

async function persist(items: RecentCard[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('[recentlyViewed] save failed', err);
  }
}

function toRecent(card: ScryfallCard): RecentCard {
  const img =
    card.image_uris?.small ?? card.card_faces?.[0]?.image_uris?.small;
  return {
    id: card.id,
    name: card.name,
    set_code: card.set,
    set_name: card.set_name,
    collector_number: card.collector_number,
    image_uri_small: img,
    price_usd: card.prices?.usd,
    viewed_at: Date.now(),
  };
}

/**
 * Record a card view. Dedupes by Scryfall id (re-viewing bumps to the
 * top). Bounded to MAX_ITEMS most recent.
 */
export async function addRecentlyViewed(card: ScryfallCard): Promise<void> {
  const current = await loadFromStorage();
  const entry = toRecent(card);
  const filtered = current.filter((c) => c.id !== entry.id);
  const next = [entry, ...filtered].slice(0, MAX_ITEMS);
  cache = next;
  notify();
  await persist(next);
}

export async function clearRecentlyViewed(): Promise<void> {
  cache = [];
  notify();
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

/**
 * Subscribe to recently-viewed cards. Hydrates from AsyncStorage on
 * first mount and keeps in sync with `addRecentlyViewed` calls from
 * anywhere in the app via an in-memory pub/sub.
 */
export function useRecentlyViewedCards() {
  const [items, setItems] = useState<RecentCard[]>(cache ?? []);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const cb = (next: RecentCard[]) => {
      if (mounted.current) setItems(next);
    };
    subscribers.add(cb);
    loadFromStorage().then((loaded) => {
      if (mounted.current) setItems(loaded);
    });
    return () => {
      mounted.current = false;
      subscribers.delete(cb);
    };
  }, []);

  const clear = useCallback(() => {
    void clearRecentlyViewed();
  }, []);

  return { items, clear };
}
