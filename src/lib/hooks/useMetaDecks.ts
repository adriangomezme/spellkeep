import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@powersync/react';
import { batchResolveByScryfallId } from '../catalog/catalogQueries';
import type { ScryfallCard } from '../scryfall';

/**
 * Meta decks feed sourced from MTGGoldfish and persisted in
 * `meta_decks` + `meta_deck_cards` by the `meta-decks` worker. The
 * tables sync to the device via PowerSync; this hook joins them
 * locally, resolves each card's `scryfall_id` against `catalog.db`,
 * and returns one entry per archetype with its mainboard cards
 * already shaped as ScryfallCard[] for the carousel.
 *
 * Sideboard rows live in the same `meta_deck_cards` table but the
 * carousel only needs mainboard — we filter at the SQL layer so the
 * device doesn't materialize sideboard data it won't render.
 */
export type MetaFormat = 'standard' | 'modern' | 'pioneer';

export type MetaDeck = {
  id: string;
  slug: string;
  name: string;
  /** Compact color identity string from the worker — e.g. 'G',
   *  'WUBRG', '' for fully colorless. */
  colors: string;
  /** Mainboard cards in deck-defined order, already resolved to
   *  ScryfallCard. The order is creatures-first → planeswalkers →
   *  spells/artifacts/enchantments/battles → lands so the carousel
   *  leads with visual cards instead of mountains.
   *
   *  We don't truncate here — consumers can `.slice(0, N)` if they
   *  want a fixed carousel length. */
  cards: ScryfallCard[];
  /** Meta percent if MTGGoldfish exposed it on the index page. */
  metaShare: number | null;
};

type DeckRow = {
  id: string;
  slug: string;
  name: string;
  colors: string;
  meta_share: number | null;
};

type CardRow = {
  deck_id: string;
  scryfall_id: string;
  category: string;
  position: number;
};

// Carousel ordering applied at the SQL layer below — Creatures →
// Spells → Enchantments → Lands. Planeswalkers ride with creatures
// (both are big-body permanents); artifacts / battles ride with
// spells (non-permanent or permanent-but-not-creature-or-enchantment).
// Sideboard never reaches the query because of `board = 'main'`.

export function useMetaDecks(format: MetaFormat): {
  decks: MetaDeck[];
  isLoading: boolean;
} {
  const { data: deckRows, isLoading: deckLoading } = useQuery<DeckRow>(
    `SELECT id, slug, name, colors, meta_share
       FROM meta_decks
      WHERE format = ?
      ORDER BY position ASC`,
    [format]
  );

  const { data: cardRows, isLoading: cardLoading } = useQuery<CardRow>(
    `SELECT deck_id, scryfall_id, category, position
       FROM meta_deck_cards
      WHERE format = ? AND board = 'main'
      ORDER BY
        CASE category
          WHEN 'creatures'     THEN 0
          WHEN 'planeswalkers' THEN 0
          WHEN 'spells'        THEN 1
          WHEN 'artifacts'     THEN 1
          WHEN 'battles'       THEN 1
          WHEN 'enchantments'  THEN 2
          WHEN 'lands'         THEN 3
          ELSE 50
        END ASC,
        position ASC`,
    [format]
  );

  // Group card rows by deck. The SQL ORDER BY already returns rows in
  // (category-rank, position) order, so insertion preserves the
  // intended carousel ordering — no client-side sort needed.
  const cardsByDeck = useMemo(() => {
    const map = new Map<string, CardRow[]>();
    for (const row of cardRows ?? []) {
      const arr = map.get(row.deck_id) ?? [];
      arr.push(row);
      map.set(row.deck_id, arr);
    }
    return map;
  }, [cardRows]);

  // Collect every distinct scryfall_id across the format so we can
  // batch-resolve them in one catalog round-trip instead of per deck.
  const allIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of cardRows ?? []) ids.add(row.scryfall_id);
    return Array.from(ids);
  }, [cardRows]);
  const idsKey = useMemo(() => allIds.join('|'), [allIds]);

  const [resolvedMap, setResolvedMap] = useState<Map<string, ScryfallCard>>(
    () => new Map()
  );
  const [isResolving, setIsResolving] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (allIds.length === 0) {
      setResolvedMap(new Map());
      setIsResolving(false);
      return () => {
        mountedRef.current = false;
      };
    }
    setIsResolving(true);
    batchResolveByScryfallId(allIds)
      .then((map) => {
        if (mountedRef.current) setResolvedMap(map);
      })
      .catch(() => {
        if (mountedRef.current) setResolvedMap(new Map());
      })
      .finally(() => {
        if (mountedRef.current) setIsResolving(false);
      });
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const decks = useMemo<MetaDeck[]>(() => {
    if (!deckRows || deckRows.length === 0) return [];
    return deckRows.map((deck) => {
      const rows = cardsByDeck.get(deck.id) ?? [];
      const cards: ScryfallCard[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        if (seen.has(row.scryfall_id)) continue;
        const card = resolvedMap.get(row.scryfall_id);
        if (!card) continue;
        cards.push(card);
        seen.add(row.scryfall_id);
      }
      return {
        id: deck.id,
        slug: deck.slug,
        name: deck.name,
        colors: deck.colors,
        metaShare: deck.meta_share,
        cards,
      };
    });
  }, [deckRows, cardsByDeck, resolvedMap]);

  // Loading is true while either PowerSync query is doing its first
  // sync, OR the catalog batch-resolve is still in flight, OR we have
  // deck rows but the resolver hasn't produced cards for them yet.
  // After the initial sync settles with no rows, isLoading is false
  // and decks is empty — that's the "section never had data" state.
  const idsResolved = idsKey.length === 0 || resolvedMap.size > 0;
  const isLoading =
    deckLoading ||
    cardLoading ||
    isResolving ||
    ((deckRows?.length ?? 0) > 0 && !idsResolved);

  return { decks, isLoading };
}
