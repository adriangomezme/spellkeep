import { gzipSync } from 'node:zlib';
import { getLastSuccessfulRun } from '../db.ts';
import { supabase } from '../supabase.ts';

const DELTAS_BUCKET = 'catalog-deltas';
const INDEX_PATH = 'index.json';

// Columns worth shipping when a card merely had its price/legalities refreshed.
// Kept short so the delta JSON stays light (~500 KB / day).
const VOLATILE_COLUMNS = [
  'scryfall_id',
  'price_usd',
  'price_usd_foil',
  'price_eur',
  'price_eur_foil',
  'legalities',
  'updated_at',
] as const;

// Full set of "live" columns we ship for brand-new cards (first time
// the client sees them). Keep in sync with snapshot.ts.
const LIVE_COLUMNS = [
  'scryfall_id',
  'oracle_id',
  'name',
  'mana_cost',
  'cmc',
  'type_line',
  'colors',
  'color_identity',
  'rarity',
  'set_code',
  'set_name',
  'collector_number',
  'image_uri_small',
  'image_uri_normal',
  'price_usd',
  'price_usd_foil',
  'price_eur',
  'price_eur_foil',
  'legalities',
  'released_at',
  'is_legendary',
  'layout',
  'updated_at',
] as const;

export async function buildDelta(runStartedAt: string): Promise<string | null> {
  const previousRun = await getLastSuccessfulRun();
  if (!previousRun) {
    // First-ever run: nothing to diff against. The client will bootstrap
    // from the snapshot instead.
    return null;
  }

  // Fetch cards that changed between the previous successful run and now.
  // We use the previous run's started_at as the lower bound so we never miss
  // anything that mutated during the previous run itself.
  const since = previousRun.started_at;

  const { data, error } = await supabase
    .from('cards')
    .select(LIVE_COLUMNS.join(','))
    .gte('updated_at', since);

  if (error) throw new Error(`delta query failed: ${error.message}`);

  const changedCards = (data ?? []) as any[];
  if (changedCards.length === 0) {
    console.log('[catalog-sync] delta: no changes since previous run');
    return null;
  }

  // We don't have a cheap way to tell "brand new" from "price-only update"
  // without another roundtrip. Shipping full LIVE_COLUMNS for all of them
  // is safe and only marginally heavier than splitting. If we need to slim
  // it later, we can compare `created_at` against `since`.
  const payload = {
    version: runStartedAt.slice(0, 10),
    generated_at: new Date().toISOString(),
    previous_run_started_at: since,
    changed_cards: changedCards,
  };

  const json = JSON.stringify(payload);
  const gz = gzipSync(Buffer.from(json, 'utf-8'));

  const dateKey = runStartedAt.slice(0, 10);
  const objectPath = `${dateKey}.json.gz`;

  const { error: upErr } = await supabase.storage
    .from(DELTAS_BUCKET)
    .upload(objectPath, gz, {
      contentType: 'application/json',
      cacheControl: '604800, immutable',
      upsert: true,
    });

  if (upErr) throw new Error(`delta upload failed: ${upErr.message}`);

  const { data: pub } = supabase.storage.from(DELTAS_BUCKET).getPublicUrl(objectPath);
  const deltaUrl = pub.publicUrl;

  await updateIndex({ latest_delta: dateKey, latest_delta_url: deltaUrl });

  console.log(`[catalog-sync] delta: ${changedCards.length} cards, ${gz.byteLength} bytes (gz)`);
  return deltaUrl;
}

async function updateIndex(patch: Record<string, unknown>): Promise<void> {
  let current: Record<string, unknown> = {};
  const { data: existing } = await supabase.storage.from(DELTAS_BUCKET).download(INDEX_PATH);
  if (existing) {
    try {
      current = JSON.parse(await existing.text());
    } catch {
      current = {};
    }
  }

  const next = { ...current, ...patch, updated_at: new Date().toISOString() };
  const body = new Blob([JSON.stringify(next, null, 2)], { type: 'application/json' });

  const { error } = await supabase.storage
    .from(DELTAS_BUCKET)
    .upload(INDEX_PATH, body, {
      contentType: 'application/json',
      cacheControl: '300',
      upsert: true,
    });

  if (error) throw new Error(`index upload failed: ${error.message}`);
}

export const deltaInternals = { updateIndex, VOLATILE_COLUMNS, LIVE_COLUMNS };
