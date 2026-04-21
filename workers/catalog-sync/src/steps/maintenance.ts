import { supabase } from '../supabase.ts';

/**
 * Runs the housekeeping RPC defined in migration 00043:
 *   - Clears expired `snoozed_until` timestamps on price_alerts.
 *   - Trims price_alert_events (keep last 100 per alert OR within 90 d).
 *
 * Non-fatal: any error is logged and swallowed so it can't block the
 * rest of the sweep from succeeding.
 */
export async function runPriceAlertMaintenance(): Promise<void> {
  const { data, error } = await supabase.rpc('sp_run_price_alert_maintenance');
  if (error) {
    console.warn(`[maintenance] failed: ${error.message}`);
    return;
  }
  const summary = data as { cleared_snoozes?: number; deleted_events?: number } | null;
  const cleared = summary?.cleared_snoozes ?? 0;
  const deleted = summary?.deleted_events ?? 0;
  if (cleared === 0 && deleted === 0) {
    console.log('[maintenance] nothing to clean');
    return;
  }
  console.log(
    `[maintenance] cleared ${cleared} expired snooze(s), deleted ${deleted} old event(s)`
  );
}
