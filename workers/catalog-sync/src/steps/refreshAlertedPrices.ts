import { supabase } from '../supabase.ts';

const SCRYFALL_API = 'https://api.scryfall.com';
// Scryfall asks for ~50–100 ms between requests. We keep 100 ms (10 req/s)
// and run a fixed concurrency of 5 workers → effective ~50 req/s, which is
// well within their guidance for a single UA with a descriptive name.
const REQUEST_DELAY_MS = 100;
const CONCURRENCY = 5;

async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

type PriceUpdate = {
  scryfall_id: string;
  price_usd: number | null;
  price_usd_foil: number | null;
  price_usd_etched: number | null;
};

async function fetchCardPrices(scryfallId: string): Promise<PriceUpdate | null> {
  const res = await fetch(`${SCRYFALL_API}/cards/${scryfallId}`, {
    headers: { 'User-Agent': 'SpellKeep/1.0 (price-alerts-sweep)' },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Scryfall card fetch ${scryfallId} failed: ${res.status}`);
  }
  const card: any = await res.json();
  const parse = (v: unknown): number | null => {
    if (typeof v === 'string' && v.trim() !== '') {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    return null;
  };
  return {
    scryfall_id: scryfallId,
    price_usd: parse(card.prices?.usd),
    price_usd_foil: parse(card.prices?.usd_foil),
    price_usd_etched: parse(card.prices?.usd_etched),
  };
}

/**
 * Fetches fresh prices from Scryfall only for cards that have at least one
 * active price alert, and writes them back to the `cards` table. Called in
 * light-mode runs (between daily bulk syncs) so alerts always evaluate
 * against prices that are at most a few hours old.
 */
export async function refreshAlertedPrices(): Promise<{ cards: number; updated: number }> {
  const { data: rows, error } = await supabase
    .from('price_alerts')
    .select('card_id')
    .eq('status', 'active');
  if (error) throw new Error(`price_alerts select failed: ${error.message}`);

  const ids = Array.from(new Set((rows ?? []).map((r: any) => r.card_id as string)));
  if (ids.length === 0) {
    console.log('[alerts] no active alerts — skipping price refresh');
    return { cards: 0, updated: 0 };
  }
  console.log(`[alerts] refreshing prices for ${ids.length} alerted card(s)`);

  const updates: PriceUpdate[] = [];
  let fetched = 0;

  // Sliding concurrency: each worker pulls from a shared cursor until the
  // list is drained.
  let cursor = 0;
  async function worker() {
    while (true) {
      const myIndex = cursor++;
      if (myIndex >= ids.length) return;
      const id = ids[myIndex];
      try {
        const update = await fetchCardPrices(id);
        if (update) updates.push(update);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[alerts] price fetch skipped for ${id}: ${msg}`);
      }
      fetched++;
      if (fetched % 50 === 0) {
        console.log(`[alerts] price refresh progress: ${fetched}/${ids.length}`);
      }
      await sleep(REQUEST_DELAY_MS);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Bulk UPDATE via RPC. Can't use supabase-js .upsert() against `cards`
  // because Postgres evaluates NOT NULL on the prospective INSERT row
  // (e.g. oracle_id) before resolving ON CONFLICT → the row is rejected
  // even though the UPDATE branch is what we actually want.
  const now = new Date().toISOString();
  const BATCH = 500;
  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const slice = updates.slice(i, i + BATCH).map((u) => ({
      scryfall_id: u.scryfall_id,
      price_usd: u.price_usd,
      price_usd_foil: u.price_usd_foil,
      price_usd_etched: u.price_usd_etched,
      updated_at: now,
    }));
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      'sp_update_card_prices',
      { rows: slice }
    );
    if (rpcErr) {
      throw new Error(`sp_update_card_prices failed: ${rpcErr.message}`);
    }
    written += typeof rpcResult === 'number' ? rpcResult : slice.length;
  }
  console.log(`[alerts] price refresh wrote ${written} rows`);
  return { cards: ids.length, updated: written };
}
