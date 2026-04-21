import { supabase } from '../supabase.ts';
import {
  computeTargetUsd,
  hasCrossed,
  priceColumnForFinish,
  type PriceAlertDirection,
  type PriceAlertMode,
} from '../alertRules.ts';

type ActiveAlertRow = {
  id: string;
  user_id: string;
  card_id: string;
  card_name: string;
  finish: string;
  direction: PriceAlertDirection;
  mode: PriceAlertMode;
  target_value: number;
  snapshot_price: number;
};

type CardPriceRow = {
  scryfall_id: string;
  price_usd: number | null;
  price_usd_foil: number | null;
  price_usd_etched: number | null;
};

export type TriggeredAlert = {
  id: string;
  user_id: string;
  card_id: string;
  card_name: string;
  finish: string;
  direction: PriceAlertDirection;
  target_price: number;
  current_price: number;
};

/**
 * Compares every active alert's target against the current price in the
 * `cards` table. Rows that have crossed their target in the alert's
 * direction flip to `status='triggered'` with `triggered_at=NOW()`.
 *
 * Returns the list of rows we flipped so the caller can fan out push
 * notifications to the owning users.
 */
export async function evaluatePriceAlerts(): Promise<TriggeredAlert[]> {
  const { data: alerts, error: aErr } = await supabase
    .from('price_alerts')
    .select(
      'id, user_id, card_id, card_name, finish, direction, mode, target_value, snapshot_price'
    )
    .eq('status', 'active')
    .returns<ActiveAlertRow[]>();
  if (aErr) throw new Error(`active alerts select failed: ${aErr.message}`);
  const active = alerts ?? [];
  if (active.length === 0) {
    console.log('[alerts] no active alerts to evaluate');
    return [];
  }
  console.log(`[alerts] evaluating ${active.length} active alert(s)`);

  const cardIds = Array.from(new Set(active.map((a) => a.card_id)));
  // Chunk the IN() query so we don't blow past URL length limits on
  // Supabase's PostgREST gateway. ~200 uuids per round-trip is safe.
  const BATCH = 200;
  const priceByCard = new Map<string, CardPriceRow>();
  for (let i = 0; i < cardIds.length; i += BATCH) {
    const slice = cardIds.slice(i, i + BATCH);
    const { data: prices, error: pErr } = await supabase
      .from('cards')
      .select('scryfall_id, price_usd, price_usd_foil, price_usd_etched')
      .in('scryfall_id', slice)
      .returns<CardPriceRow[]>();
    if (pErr) throw new Error(`cards price select failed: ${pErr.message}`);
    for (const p of prices ?? []) priceByCard.set(p.scryfall_id, p);
  }

  const triggered: TriggeredAlert[] = [];
  for (const a of active) {
    const priceRow = priceByCard.get(a.card_id);
    if (!priceRow) continue;
    const col = priceColumnForFinish(a.finish);
    const currentPrice = priceRow[col];
    if (currentPrice == null) continue;
    const target = computeTargetUsd(a.snapshot_price, a.mode, a.direction, a.target_value);
    if (!hasCrossed(a.direction, currentPrice, target)) continue;
    triggered.push({
      id: a.id,
      user_id: a.user_id,
      card_id: a.card_id,
      card_name: a.card_name,
      finish: a.finish,
      direction: a.direction,
      target_price: target,
      current_price: currentPrice,
    });
  }

  if (triggered.length === 0) {
    console.log('[alerts] no alerts crossed their target');
    return [];
  }

  console.log(`[alerts] flipping ${triggered.length} alert(s) to triggered`);
  const now = new Date().toISOString();
  // Chunked UPDATE via `IN` to keep payloads small.
  for (let i = 0; i < triggered.length; i += 200) {
    const slice = triggered.slice(i, i + 200);
    const { error: uErr } = await supabase
      .from('price_alerts')
      .update({ status: 'triggered', triggered_at: now })
      .in(
        'id',
        slice.map((t) => t.id)
      );
    if (uErr) throw new Error(`price_alerts flip failed: ${uErr.message}`);
  }
  return triggered;
}
