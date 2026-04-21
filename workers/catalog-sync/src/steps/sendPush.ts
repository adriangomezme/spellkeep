import { supabase } from '../supabase.ts';
import type { TriggeredAlert } from './evaluateAlerts.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Expo accepts up to 100 messages per request.
const BATCH = 100;

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound?: 'default';
  priority?: 'high';
  channelId?: string;
};

type ExpoReceipt = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

type TokenRow = { user_id: string; token: string };

function buildMessageBody(t: TriggeredAlert): string {
  const target = `$${t.target_price.toFixed(2)}`;
  const verb = t.direction === 'below' ? 'below' : 'above';
  return `${t.card_name} hit your ${verb} ${target} target`;
}

/**
 * Fan-out push delivery for a batch of triggered alerts. Fetches every
 * push token belonging to the affected users, composes one message per
 * (token, alert) pair, and POSTs to Expo's push API in batches of 100.
 *
 * Invalid tokens (DeviceNotRegistered) are pruned so we don't keep
 * retrying them on every sweep.
 */
export async function sendPushForTriggered(triggered: TriggeredAlert[]): Promise<{ sent: number; pruned: number }> {
  if (triggered.length === 0) return { sent: 0, pruned: 0 };

  const userIds = Array.from(new Set(triggered.map((t) => t.user_id)));
  const { data: tokens, error } = await supabase
    .from('device_push_tokens')
    .select('user_id, token')
    .in('user_id', userIds)
    .returns<TokenRow[]>();
  if (error) throw new Error(`push token select failed: ${error.message}`);
  const rows = tokens ?? [];
  if (rows.length === 0) {
    console.log(`[alerts] triggered=${triggered.length} but no push tokens registered — skipping`);
    return { sent: 0, pruned: 0 };
  }

  const tokensByUser = new Map<string, string[]>();
  for (const r of rows) {
    const existing = tokensByUser.get(r.user_id);
    if (existing) existing.push(r.token);
    else tokensByUser.set(r.user_id, [r.token]);
  }

  const messages: ExpoMessage[] = [];
  for (const t of triggered) {
    const userTokens = tokensByUser.get(t.user_id) ?? [];
    for (const token of userTokens) {
      messages.push({
        to: token,
        title: 'Price alert triggered',
        body: buildMessageBody(t),
        data: { alertId: t.id, cardId: t.card_id },
        sound: 'default',
        priority: 'high',
        channelId: 'price-alerts',
      });
    }
  }

  if (messages.length === 0) return { sent: 0, pruned: 0 };
  console.log(`[alerts] sending ${messages.length} push message(s) across ${tokensByUser.size} user(s)`);

  const tokensToPrune = new Set<string>();
  let sent = 0;

  for (let i = 0; i < messages.length; i += BATCH) {
    const slice = messages.slice(i, i + BATCH);
    let body: any;
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
        },
        body: JSON.stringify(slice),
      });
      if (!res.ok) {
        console.warn(`[alerts] expo push batch failed: ${res.status} ${await res.text()}`);
        continue;
      }
      body = await res.json();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[alerts] expo push batch error: ${msg}`);
      continue;
    }

    const receipts: ExpoReceipt[] = body?.data ?? [];
    receipts.forEach((r, idx) => {
      if (r.status === 'ok') {
        sent++;
      } else if (r.details?.error === 'DeviceNotRegistered') {
        tokensToPrune.add(slice[idx].to);
      } else {
        console.warn(`[alerts] expo push rejected: ${r.message ?? r.status} (${slice[idx].to})`);
      }
    });
  }

  if (tokensToPrune.size > 0) {
    const { error: delErr } = await supabase
      .from('device_push_tokens')
      .delete()
      .in('token', Array.from(tokensToPrune));
    if (delErr) {
      console.warn(`[alerts] failed to prune ${tokensToPrune.size} dead token(s): ${delErr.message}`);
    } else {
      console.log(`[alerts] pruned ${tokensToPrune.size} dead push token(s)`);
    }
  }

  return { sent, pruned: tokensToPrune.size };
}
