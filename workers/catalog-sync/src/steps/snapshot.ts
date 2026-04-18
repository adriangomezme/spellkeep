import { gzipSync } from 'node:zlib';
import { supabase } from '../supabase.ts';
import { config } from '../config.ts';
import { deltaInternals } from './delta.ts';

const SNAPSHOTS_BUCKET = 'catalog-snapshots';
const DELTAS_INDEX_PATH = 'index.json';
const PAGE = 1000;

// Each card chunk holds ~5000 cards and lands around ~800 KB gz / ~6 MB JSON.
// Small enough that the client can ungzip + JSON.parse a single chunk in
// well under a second without hanging the JS thread, large enough to keep
// chunk count reasonable (~20 requests for a full bootstrap).
const SNAPSHOT_CARD_CHUNK_SIZE = 5000;

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
 * Builds a chunked JSON snapshot of the catalog and publishes it to Storage.
 *
 * Layout:
 *   catalog-snapshots/<date>/sets.json.gz
 *   catalog-snapshots/<date>/cards-0.json.gz   (5000 cards)
 *   catalog-snapshots/<date>/cards-1.json.gz
 *   ...
 *
 * A single 100 MB+ JSON payload stalls the React Native JS thread for
 * 20–30 s during JSON.parse, freezing the UI. Chunking keeps each parse
 * under a second and lets the client paint progress between chunks.
 */
export async function buildSnapshot(): Promise<string | null> {
  if (!config.forceSnapshot && !(await shouldRegenerate())) {
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);

  const cards = await fetchAllCards();
  const sets = await fetchAllSets();

  const chunkCount = Math.ceil(cards.length / SNAPSHOT_CARD_CHUNK_SIZE);
  let totalGzBytes = 0;

  for (let i = 0; i < chunkCount; i++) {
    const chunk = cards.slice(i * SNAPSHOT_CARD_CHUNK_SIZE, (i + 1) * SNAPSHOT_CARD_CHUNK_SIZE);
    const gz = gzipSync(Buffer.from(JSON.stringify({ cards: chunk }), 'utf-8'));
    totalGzBytes += gz.byteLength;
    await uploadGz(`${today}/cards-${i}.json.gz`, gz);
  }

  const setsGz = gzipSync(Buffer.from(JSON.stringify({ sets }), 'utf-8'));
  totalGzBytes += setsGz.byteLength;
  await uploadGz(`${today}/sets.json.gz`, setsGz);

  const baseUrl = publicUrlFor(`${today}`);

  await patchDeltasIndex({
    snapshot_version: today,
    snapshot_base_url: baseUrl,
    snapshot_card_chunks: chunkCount,
    snapshot_card_chunk_size: SNAPSHOT_CARD_CHUNK_SIZE,
    snapshot_card_count: cards.length,
    snapshot_set_count: sets.length,
    snapshot_gz_bytes: totalGzBytes,
    // Intentionally omit legacy snapshot_url — clients that still read the
    // old single-file layout will fall through and re-bootstrap once they
    // see snapshot_base_url on the new schema.
  });

  console.log(
    `[catalog-sync] snapshot: ${cards.length} cards in ${chunkCount} chunks, ${sets.length} sets, ${totalGzBytes} bytes gz total`
  );
  return baseUrl;
}

async function uploadGz(objectPath: string, body: Buffer): Promise<void> {
  const { error } = await supabase.storage
    .from(SNAPSHOTS_BUCKET)
    .upload(objectPath, body, {
      contentType: 'application/json',
      cacheControl: '2592000, immutable',
      upsert: true,
    });
  if (error) throw new Error(`snapshot upload ${objectPath} failed: ${error.message}`);
}

function publicUrlFor(path: string): string {
  const { data } = supabase.storage.from(SNAPSHOTS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function shouldRegenerate(): Promise<boolean> {
  // New layout: snapshot is a folder <date>/. List top-level prefixes by
  // walking `list('')` which returns folder-like entries.
  const { data } = await supabase.storage.from(SNAPSHOTS_BUCKET).list('', { limit: 100 });
  if (!data || data.length === 0) return true;

  const dateFolders = data
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.name))
    .sort((a, b) => (a.name < b.name ? 1 : -1));

  if (dateFolders.length === 0) return true;

  const latest = dateFolders[0].name;
  const ageMs = Date.now() - new Date(latest).getTime();
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
  // Explicit .range(0, 9999) overrides the default 1000-row limit for sets.
  const { data, error } = await supabase
    .from('sets')
    .select(SET_COLUMNS.join(','))
    .range(0, 9999);
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
