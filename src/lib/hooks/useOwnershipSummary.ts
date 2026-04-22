import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { findSupabaseIdByScryfallId } from '../catalog/catalogQueries';
import { getCatalog } from '../catalog/catalogDb';
import type { Condition } from '../collection';
import type { CollectionType } from '../collections';

// ─────────────────────────────────────────────────────────────────────────
// Local-first ownership lookups for the card-detail screen.
//
// The card detail used to hit Supabase twice (summary of every binder the
// user has this print in, plus "which prints of this oracle do I own" for
// the prints list). Both are derivable from the local PowerSync SQLite
// joined with catalog.db, so we do it all locally and let useQuery make
// the UI react to +/- buttons without a refetch.
// ─────────────────────────────────────────────────────────────────────────

export type OwnershipEntry = {
  id: string;
  collection_id: string;
  collection_name: string;
  collection_type: CollectionType;
  collection_color: string | null;
  condition: Condition;
  quantity_normal: number;
  quantity_foil: number;
  quantity_etched: number;
  purchase_price: number | null;
};

export type OwnershipSummary = {
  /** Total copies across binders + lists. */
  total: number;
  /** Copies held in binders only — lists are wish/trade surfaces so the
   *  card-detail "owned" count should ignore them. */
  binderTotal: number;
  normal: number;
  foil: number;
  etched: number;
  entries: OwnershipEntry[];
};

const EMPTY: OwnershipSummary = { total: 0, binderTotal: 0, normal: 0, foil: 0, etched: 0, entries: [] };

type Row = {
  id: string;
  collection_id: string;
  collection_name: string;
  collection_type: CollectionType;
  collection_color: string | null;
  condition: Condition;
  quantity_normal: number;
  quantity_foil: number;
  quantity_etched: number;
  purchase_price: number | null;
};

/**
 * Live ownership summary for a single card. Re-renders automatically
 * when the user adds/removes copies from any binder — powered by useQuery
 * on the local collection_cards table.
 */
export function useOwnershipSummary(
  scryfallId: string | null | undefined
): OwnershipSummary {
  // card_id lives in catalog.db (keyed by scryfall_id). Resolve once per
  // card; cache in state so the useQuery params stay stable.
  const [cardId, setCardId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!scryfallId) { setCardId(null); return; }
    findSupabaseIdByScryfallId(scryfallId).then((id) => {
      if (!cancelled) setCardId(id ?? null);
    });
    return () => { cancelled = true; };
  }, [scryfallId]);

  // Sort: binders first, then lists — each group alphabetical. Matches
  // the legacy fetchOwnershipByScryfallId output so the detail screen
  // order doesn't jump around during the migration.
  const rows = useQuery<Row>(
    `SELECT cc.id,
            cc.collection_id,
            c.name AS collection_name,
            c.type AS collection_type,
            c.color AS collection_color,
            cc.condition,
            cc.quantity_normal,
            cc.quantity_foil,
            cc.quantity_etched,
            cc.purchase_price
       FROM collection_cards cc
       JOIN collections c ON c.id = cc.collection_id
      WHERE cc.card_id = ?
      ORDER BY CASE c.type WHEN 'binder' THEN 0 ELSE 1 END,
               LOWER(c.name)`,
    [cardId ?? '']
  );

  return useMemo<OwnershipSummary>(() => {
    if (!cardId || !rows.data) return EMPTY;
    const entries: OwnershipEntry[] = [];
    let total = 0;
    let binderTotal = 0;
    let normal = 0;
    let foil = 0;
    let etched = 0;
    for (const r of rows.data) {
      const qn = Number(r.quantity_normal ?? 0);
      const qf = Number(r.quantity_foil ?? 0);
      const qe = Number(r.quantity_etched ?? 0);
      const rowTotal = qn + qf + qe;
      entries.push({
        id: r.id,
        collection_id: r.collection_id,
        collection_name: r.collection_name,
        collection_type: r.collection_type,
        collection_color: r.collection_color ?? null,
        condition: r.condition,
        quantity_normal: qn,
        quantity_foil: qf,
        quantity_etched: qe,
        purchase_price: r.purchase_price ?? null,
      });
      normal += qn;
      foil += qf;
      etched += qe;
      total += rowTotal;
      if (r.collection_type === 'binder') binderTotal += rowTotal;
    }
    return { total, binderTotal, normal, foil, etched, entries };
  }, [cardId, rows.data]);
}

/**
 * Owned quantity per scryfall_id for every print of the given oracle.
 * Powers the "owned X" badge on the prints list in card detail.
 *
 * catalog.db → oracle → card_ids + scryfall_ids; PowerSync → per-row
 * quantities for those card_ids. Result: a map keyed by scryfall_id
 * that updates live when the user toggles +/- on any print.
 */
export function useOwnedQtyByOracleId(
  oracleId: string | null | undefined
): Record<string, number> {
  const [idMap, setIdMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    if (!oracleId) { setIdMap({}); return; }
    (async () => {
      const db = getCatalog();
      if (!db) { setIdMap({}); return; }
      try {
        const res = await db.execute(
          `SELECT id, scryfall_id FROM cards WHERE oracle_id = ?`,
          [oracleId]
        );
        const arr = (res as any)?.rows?._array ?? [];
        const map: Record<string, string> = {};
        for (const row of arr) {
          if (row?.id && row?.scryfall_id) map[row.id] = row.scryfall_id;
        }
        if (!cancelled) setIdMap(map);
      } catch {
        if (!cancelled) setIdMap({});
      }
    })();
    return () => { cancelled = true; };
  }, [oracleId]);

  const cardIds = useMemo(() => Object.keys(idMap), [idMap]);

  // Build `IN (?, ?, ...)` dynamically keyed on cardIds.length so the
  // placeholder count matches the args array.
  //
  // INNER JOIN collections filters out orphan collection_cards rows that
  // linger in local SQLite between an optimistic delete of a binder and
  // the cascade deletes coming back through the sync stream — without it
  // the owned-qty badge double-counts during those 1-5 s.
  const sql = useMemo(() => {
    if (cardIds.length === 0) {
      return `SELECT card_id, quantity_normal, quantity_foil, quantity_etched FROM collection_cards WHERE 0`;
    }
    const placeholders = cardIds.map(() => '?').join(',');
    return `SELECT cc.card_id,
                   SUM(cc.quantity_normal + cc.quantity_foil + cc.quantity_etched) AS total
              FROM collection_cards cc
              JOIN collections c ON c.id = cc.collection_id
             WHERE cc.card_id IN (${placeholders})
             GROUP BY cc.card_id`;
  }, [cardIds]);

  const rows = useQuery<{ card_id: string; total: number }>(sql, cardIds);

  return useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of rows.data ?? []) {
      const sid = idMap[r.card_id];
      if (!sid) continue;
      out[sid] = Number(r.total ?? 0);
    }
    return out;
  }, [rows.data, idMap]);
}
