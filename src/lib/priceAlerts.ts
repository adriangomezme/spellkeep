import { db } from './powersync/system';
import { supabase } from './supabase';
import type { Finish } from './collection';
import type { ScryfallCard } from './scryfall';
import { getCardImageUri } from './scryfall';

export type PriceAlertDirection = 'below' | 'above';
export type PriceAlertMode = 'price' | 'percent';
export type PriceAlertStatus = 'active' | 'triggered' | 'paused';

export interface PriceAlert {
  id: string;
  user_id: string;
  card_id: string;
  card_name: string;
  card_set: string;
  card_collector_number: string;
  card_image_uri: string | null;
  finish: Finish;
  direction: PriceAlertDirection;
  mode: PriceAlertMode;
  target_value: number;
  snapshot_price: number;
  status: PriceAlertStatus;
  snoozed_until: string | null;
  auto_rearm: number; // 0/1 in SQLite
  created_at: string;
  triggered_at: string | null;
  updated_at: string;
}

async function getUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  return session.user.id;
}

// Same v4 UUID generator used across the local-first mutations.
function newId(): string {
  const hex: string[] = [];
  for (let i = 0; i < 256; i++) hex[i] = (i < 16 ? '0' : '') + i.toString(16);
  const r0 = (Math.random() * 0x100000000) >>> 0;
  const r1 = (Math.random() * 0x100000000) >>> 0;
  const r2 = (Math.random() * 0x100000000) >>> 0;
  const r3 = (Math.random() * 0x100000000) >>> 0;
  return (
    hex[r0 & 0xff] + hex[(r0 >>> 8) & 0xff] + hex[(r0 >>> 16) & 0xff] + hex[(r0 >>> 24) & 0xff] + '-' +
    hex[r1 & 0xff] + hex[(r1 >>> 8) & 0xff] + '-' +
    hex[((r1 >>> 16) & 0x0f) | 0x40] + hex[(r1 >>> 24) & 0xff] + '-' +
    hex[(r2 & 0x3f) | 0x80] + hex[(r2 >>> 8) & 0xff] + '-' +
    hex[(r2 >>> 16) & 0xff] + hex[(r2 >>> 24) & 0xff] +
    hex[r3 & 0xff] + hex[(r3 >>> 8) & 0xff] + hex[(r3 >>> 16) & 0xff] + hex[(r3 >>> 24) & 0xff]
  );
}

/** Resolve target absolute USD from the alert spec. */
export function computeTargetUsd(
  snapshotPrice: number,
  mode: PriceAlertMode,
  direction: PriceAlertDirection,
  value: number
): number {
  if (mode === 'price') return value;
  // percent: value is an unsigned magnitude (e.g. 15 for "15%"); direction
  // decides which side of the snapshot we land on.
  const signed = direction === 'below' ? -Math.abs(value) : Math.abs(value);
  return snapshotPrice * (1 + signed / 100);
}

export function priceFromCard(card: ScryfallCard, finish: Finish): number | null {
  const key = finish === 'normal' ? 'usd' : finish === 'foil' ? 'usd_foil' : 'usd_etched';
  const raw = card.prices?.[key];
  const parsed = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export const MAX_ALERTS_PER_CARD = 10;
export const MAX_ACTIVE_ALERTS_PER_USER = 250;

function extractCount(res: any): number {
  const rows: any[] = Array.isArray(res?.rows?._array)
    ? res.rows._array
    : Array.isArray(res?.rows)
      ? res.rows
      : [];
  return Number(rows[0]?.cnt ?? 0);
}

export async function countAlertsForCard(cardId: string): Promise<number> {
  const res: any = await db.execute(
    `SELECT COUNT(*) AS cnt FROM price_alerts WHERE card_id = ?`,
    [cardId]
  );
  return extractCount(res);
}

export async function countActiveAlertsForUser(userId: string): Promise<number> {
  const res: any = await db.execute(
    `SELECT COUNT(*) AS cnt FROM price_alerts WHERE user_id = ? AND status = 'active'`,
    [userId]
  );
  return extractCount(res);
}

export async function createAlertFromCard(params: {
  card: ScryfallCard;
  finish: Finish;
  direction: PriceAlertDirection;
  mode: PriceAlertMode;
  targetValue: number;
  snapshotPrice: number;
  autoRearm?: boolean;
}): Promise<string> {
  const userId = await getUserId();
  const existingForCard = await countAlertsForCard(params.card.id);
  if (existingForCard >= MAX_ALERTS_PER_CARD) {
    throw new Error(
      `You can have at most ${MAX_ALERTS_PER_CARD} alerts per card. Delete one first.`
    );
  }
  const activeForUser = await countActiveAlertsForUser(userId);
  if (activeForUser >= MAX_ACTIVE_ALERTS_PER_USER) {
    throw new Error(
      `You've reached the limit of ${MAX_ACTIVE_ALERTS_PER_USER} active alerts. Pause or delete one to add a new one.`
    );
  }
  const id = newId();
  const now = new Date().toISOString();
  const imageUri = getCardImageUri(params.card, 'small') ?? null;
  await db.execute(
    `INSERT INTO price_alerts
       (id, user_id, card_id, card_name, card_set, card_collector_number,
        card_image_uri, finish, direction, mode, target_value, snapshot_price,
        status, snoozed_until, auto_rearm, created_at, triggered_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      params.card.id,
      params.card.name,
      params.card.set,
      params.card.collector_number,
      imageUri,
      params.finish,
      params.direction,
      params.mode,
      params.targetValue,
      params.snapshotPrice,
      'active',
      null,
      params.autoRearm ? 1 : 0,
      now,
      null,
      now,
    ]
  );
  return id;
}

export async function updateAlertLocal(
  id: string,
  patch: {
    direction?: PriceAlertDirection;
    mode?: PriceAlertMode;
    targetValue?: number;
    finish?: Finish;
    status?: PriceAlertStatus;
    autoRearm?: boolean;
    snoozedUntil?: string | null;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const sets: string[] = ['updated_at = ?'];
  const vals: any[] = [now];
  if (patch.direction !== undefined) { sets.push('direction = ?'); vals.push(patch.direction); }
  if (patch.mode !== undefined) { sets.push('mode = ?'); vals.push(patch.mode); }
  if (patch.targetValue !== undefined) { sets.push('target_value = ?'); vals.push(patch.targetValue); }
  if (patch.finish !== undefined) { sets.push('finish = ?'); vals.push(patch.finish); }
  if (patch.status !== undefined) { sets.push('status = ?'); vals.push(patch.status); }
  if (patch.autoRearm !== undefined) { sets.push('auto_rearm = ?'); vals.push(patch.autoRearm ? 1 : 0); }
  if (patch.snoozedUntil !== undefined) { sets.push('snoozed_until = ?'); vals.push(patch.snoozedUntil); }
  vals.push(id);
  await db.execute(
    `UPDATE price_alerts SET ${sets.join(', ')} WHERE id = ?`,
    vals
  );
}

/** Snooze an alert by N hours from now. Pass 0 to cancel snooze. */
export async function snoozeAlertLocal(id: string, hours: number): Promise<void> {
  const snoozedUntil =
    hours > 0 ? new Date(Date.now() + hours * 3600 * 1000).toISOString() : null;
  await updateAlertLocal(id, { snoozedUntil });
}

/**
 * Re-activate a triggered alert. Re-anchors `snapshot_price` to the
 * supplied current market so the next evaluation measures the move from
 * today's price — otherwise the alert would satisfy its condition again
 * on the next sweep and re-trigger instantly.
 */
export async function reactivateAlertLocal(
  id: string,
  newSnapshotPrice: number
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE price_alerts
        SET status = 'active',
            triggered_at = NULL,
            snoozed_until = NULL,
            snapshot_price = ?,
            updated_at = ?
      WHERE id = ?`,
    [newSnapshotPrice, now, id]
  );
}

export async function deleteAlertLocal(id: string): Promise<void> {
  await db.execute(`DELETE FROM price_alerts WHERE id = ?`, [id]);
}

export async function setAlertStatusLocal(
  id: string,
  status: PriceAlertStatus
): Promise<void> {
  const now = new Date().toISOString();
  // Pause overrides any pending snooze — the user is stopping the alert
  // manually and expects it to stay off until they resume, not until the
  // old snooze timer elapses. Likewise resuming clears snooze because the
  // user explicitly flipped it back on.
  const clearsSnooze = status === 'paused' || status === 'active';
  await db.execute(
    `UPDATE price_alerts
        SET status = ?,
            triggered_at = CASE WHEN ? = 'active' THEN NULL ELSE triggered_at END,
            snoozed_until = CASE WHEN ? THEN NULL ELSE snoozed_until END,
            updated_at = ?
      WHERE id = ?`,
    [status, status, clearsSnooze ? 1 : 0, now, id]
  );
}

/**
 * Bulk-delete every triggered alert for the current user. Called from the
 * "Clear all" action on the Triggered tab once the user has reviewed them.
 */
export async function clearTriggeredAlertsLocal(): Promise<number> {
  const userId = await getUserId();
  const before: any = await db.execute(
    `SELECT COUNT(*) AS cnt FROM price_alerts WHERE user_id = ? AND status = 'triggered'`,
    [userId]
  );
  const count = extractCount(before);
  if (count === 0) return 0;
  await db.execute(
    `DELETE FROM price_alerts WHERE user_id = ? AND status = 'triggered'`,
    [userId]
  );
  return count;
}

/**
 * Stand-in for the eventual live-price feed. Returns a deterministic but
 * varied price per alert id, within ±20% of the snapshot, so the UI can
 * render current + delta meaningfully. Replace with a real lookup once the
 * price pipeline lands.
 */
export function simulateCurrentPrice(
  alertId: string,
  snapshotPrice: number
): number {
  let seed = 0;
  for (let i = 0; i < alertId.length; i++) {
    seed = (seed * 31 + alertId.charCodeAt(i)) >>> 0;
  }
  // Map to a signed offset in [-0.2, 0.2]
  const unit = (seed % 1000) / 1000; // 0..1
  const offset = (unit - 0.5) * 0.4; // -0.2..0.2
  const raw = snapshotPrice * (1 + offset);
  return Math.max(0.01, Math.round(raw * 100) / 100);
}
