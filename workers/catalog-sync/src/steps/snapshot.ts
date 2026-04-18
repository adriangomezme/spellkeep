import { gzipSync } from 'node:zlib';
import { supabase } from '../supabase.ts';
import { config } from '../config.ts';
import { deltaInternals } from './delta.ts';

const SNAPSHOTS_BUCKET = 'catalog-snapshots';
const DELTAS_INDEX_PATH = 'index.json';
const PAGE = 1000;

const LIVE_CARD_COLUMNS = deltaInternals.LIVE_COLUMNS;

const SET_COLUMNS = [
  'code',
  'name',
  'set_type',
  'released_at',
  'card_count',
  'icon_svg_uri',
] as const;

const SNAPSHOT_REFRESH_DAYS = 7;

/**
 * Builds a compact JSON snapshot of the catalog (all cards + all sets) and
 * publishes it to Storage as `<date>.json.gz`. The client streams this file
 * down, ungzips it, and applies the payload as bulk INSERT OR REPLACE into
 * its local catalog_* tables.
 *
 * Why JSON and not SQLite? PowerSync owns the client's SQLite database at
 * runtime; we can't swap or attach arbitrary SQLite files into it. A JSON
 * payload is the portable interchange format that fits into our existing
 * delta application path. Trade-off: the snapshot is larger on disk than a
 * SQLite file would be, but gzipped the difference is ~1.2x.
 */
export async function buildSnapshot(): Promise<string | null> {
  if (!config.forceSnapshot && !(await shouldRegenerate())) {
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);

  const cards = await fetchAllCards();
  const sets = await fetchAllSets();

  const payload = {
    version: today,
    generated_at: new Date().toISOString(),
    cards,
    sets,
  };

  const json = JSON.stringify(payload);
  const gz = gzipSync(Buffer.from(json, 'utf-8'));

  const objectPath = `${today}.json.gz`;
  const { error } = await supabase.storage
    .from(SNAPSHOTS_BUCKET)
    .upload(objectPath, gz, {
      contentType: 'application/json',
      cacheControl: '2592000, immutable',
      upsert: true,
    });
  if (error) throw new Error(`snapshot upload failed: ${error.message}`);

  const { data: pub } = supabase.storage.from(SNAPSHOTS_BUCKET).getPublicUrl(objectPath);
  const snapshotUrl = pub.publicUrl;

  await patchDeltasIndex({
    snapshot_version: today,
    snapshot_url: snapshotUrl,
    snapshot_raw_bytes: json.length,
    snapshot_gz_bytes: gz.byteLength,
    snapshot_card_count: cards.length,
    snapshot_set_count: sets.length,
  });

  console.log(`[catalog-sync] snapshot: ${cards.length} cards, ${sets.length} sets, ${gz.byteLength} bytes gz`);
  return snapshotUrl;
}

async function shouldRegenerate(): Promise<boolean> {
  const { data } = await supabase.storage.from(SNAPSHOTS_BUCKET).list('', { limit: 100 });
  if (!data || data.length === 0) return true;

  const latest = data
    .filter((f) => f.name.endsWith('.json.gz'))
    .sort((a, b) => (a.name < b.name ? 1 : -1))[0];

  if (!latest) return true;

  const dateStr = latest.name.replace('.json.gz', '');
  const ageMs = Date.now() - new Date(dateStr).getTime();
  const ageDays = ageMs / 86400000;
  return ageDays >= SNAPSHOT_REFRESH_DAYS;
}

async function fetchAllCards(): Promise<any[]> {
  const cols = LIVE_CARD_COLUMNS.join(',');
  const all: any[] = [];

  // Keyset pagination: each page selects rows strictly greater than the last
  // seen scryfall_id. This stays O(log n) per page via the scryfall_id unique
  // index, whereas .range(from, to) uses OFFSET which degrades to O(n) and
  // trips the 30s statement timeout around page ~100.
  let lastSeen: string | null = null;
  while (true) {
    let query = supabase
      .from('cards')
      .select(cols)
      .order('scryfall_id', { ascending: true })
      .limit(PAGE);
    if (lastSeen !== null) query = query.gt('scryfall_id', lastSeen);

    const { data, error } = await query;
    if (error) throw new Error(`snapshot cards fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;

    all.push(...data);
    lastSeen = (data[data.length - 1] as any).scryfall_id;

    if (data.length < PAGE) break;
    if (all.length % 20000 === 0) {
      console.log(`[catalog-sync] snapshot fetched ${all.length} cards so far`);
    }
  }
  return all;
}

async function fetchAllSets(): Promise<any[]> {
  const { data, error } = await supabase.from('sets').select(SET_COLUMNS.join(','));
  if (error) throw new Error(`snapshot sets fetch failed: ${error.message}`);
  return data ?? [];
}

async function patchDeltasIndex(patch: Record<string, unknown>): Promise<void> {
  let current: Record<string, unknown> = {};
  const { data: existing } = await supabase.storage.from('catalog-deltas').download(DELTAS_INDEX_PATH);
  if (existing) {
    try {
      current = JSON.parse(await existing.text());
    } catch {}
  }
  const next = { ...current, ...patch, updated_at: new Date().toISOString() };
  const body = new Blob([JSON.stringify(next, null, 2)], { type: 'application/json' });
  const { error } = await supabase.storage
    .from('catalog-deltas')
    .upload(DELTAS_INDEX_PATH, body, {
      contentType: 'application/json',
      cacheControl: '300',
      upsert: true,
    });
  if (error) throw new Error(`index patch failed: ${error.message}`);
}
