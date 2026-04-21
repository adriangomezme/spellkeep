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
  auto_rearm: boolean;
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
  auto_rearm: boolean;
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
  const nowIso = new Date().toISOString();
  const { data: alerts, error: aErr } = await supabase
    .from('price_alerts')
    .select(
      'id, user_id, card_id, card_name, finish, direction, mode, target_value, snapshot_price, auto_rearm'
    )
    .eq('status', 'active')
    // Skip snoozed alerts (NULL or already elapsed are eligible).
    .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`)
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
      auto_rearm: !!a.auto_rearm,
    });
  }

  if (triggered.length === 0) {
    console.log('[alerts] no alerts crossed their target');
    return [];
  }

  const oneShot = triggered.filter((t) => !t.auto_rearm);
  const rearm = triggered.filter((t) => t.auto_rearm);
  console.log(
    `[alerts] flipping ${oneShot.length} one-shot alert(s), re-arming ${rearm.length}`
  );

  const now = new Date().toISOString();

  // Append history events for every trigger — one-shot and re-arm alike.
  // Done before the status flip so if we crash mid-run the next sweep
  // doesn't lose the historical record. We persist `snapshot_price` on
  // the event so the history view stays accurate even after auto-rearm
  // overwrites the parent alert's snapshot below.
  const events = triggered.map((t) => {
    const fromActive = active.find((a) => a.id === t.id);
    return {
      alert_id: t.id,
      user_id: t.user_id,
      current_price: t.current_price,
      target_price: t.target_price,
      direction: t.direction,
      mode: fromActive?.mode ?? 'price',
      snapshot_price: fromActive?.snapshot_price ?? null,
      at: now,
    };
  });
  for (let i = 0; i < events.length; i += 200) {
    const slice = events.slice(i, i + 200);
    const { error: eErr } = await supabase.from('price_alert_events').insert(slice);
    if (eErr) {
      // Non-fatal: we still want status flips + push to run.
      console.warn(`[alerts] event insert failed: ${eErr.message}`);
      break;
    }
  }

  // One-shots → permanent triggered state until the user clears or edits.
  for (let i = 0; i < oneShot.length; i += 200) {
    const slice = oneShot.slice(i, i + 200);
    const { error: uErr } = await supabase
      .from('price_alerts')
      .update({ status: 'triggered', triggered_at: now })
      .in('id', slice.map((t) => t.id));
    if (uErr) throw new Error(`price_alerts flip failed: ${uErr.message}`);
  }

  // Auto-rearm: stay active, but re-anchor snapshot_price to the price that
  // just crossed and snooze for 1 h so we don't fire again until the
  // market moves further in the same direction. Done per-row because the
  // new snapshot differs for each alert.
  const COOLDOWN_HOURS = 1;
  const cooldownUntil = new Date(
    Date.now() + COOLDOWN_HOURS * 3600 * 1000
  ).toISOString();
  for (const t of rearm) {
    const { error: uErr } = await supabase
      .from('price_alerts')
      .update({
        triggered_at: now,
        snapshot_price: t.current_price,
        snoozed_until: cooldownUntil,
      })
      .eq('id', t.id);
    if (uErr) {
      // Log but keep going so one bad row doesn't block the batch.
      console.warn(`[alerts] rearm update failed for ${t.id}: ${uErr.message}`);
    }
  }

  return triggered;
}
