import { supabase } from '../supabase';
import { upsertPriceOverrides } from './priceOverrides';

export type RefreshProgress = {
  total: number;
  completed: number;
};

export type RefreshResult = {
  scanned: number;
  updated: number;
};

const SUPABASE_BATCH = 500;
const PAGE_SIZE = 1000;

/**
 * Fetch every distinct scryfall_id the user owns directly from Supabase.
 * We avoid the local PowerSync join because the collection_cards + cards
 * tables may not have fully synced yet when the user hits refresh — this
 * RPC-style call is also always online (the whole refresh is).
 */
async function fetchOwnedScryfallIds(): Promise<string[]> {
  const ids = new Set<string>();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('collection_cards')
      .select('cards(scryfall_id)')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to list collection: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const sid = (row as any).cards?.scryfall_id;
      if (sid) ids.add(sid);
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return [...ids];
}

/**
 * Force-refresh prices for every scryfall_id present in the user's collection.
 * Writes results to the local-only price_overrides table which takes
 * precedence over the snapshot until the next catalog sync purges it.
 */
export async function refreshCollectionPrices(
  onProgress?: (p: RefreshProgress) => void
): Promise<RefreshResult> {
  const scryfallIds = await fetchOwnedScryfallIds();
  const total = scryfallIds.length;
  onProgress?.({ total, completed: 0 });
  if (total === 0) return { scanned: 0, updated: 0 };

  const refreshedAt = new Date().toISOString();
  let completed = 0;
  let updated = 0;

  for (let i = 0; i < scryfallIds.length; i += SUPABASE_BATCH) {
    const chunk = scryfallIds.slice(i, i + SUPABASE_BATCH);
    const { data, error } = await supabase
      .from('cards')
      .select('scryfall_id, price_usd, price_usd_foil')
      .in('scryfall_id', chunk);
    if (error) throw new Error(`Price refresh failed: ${error.message}`);

    await upsertPriceOverrides(
      (data ?? []).map((row: any) => ({
        scryfall_id: row.scryfall_id,
        price_usd: row.price_usd ?? null,
        price_usd_foil: row.price_usd_foil ?? null,
      })),
      refreshedAt
    );

    updated += data?.length ?? 0;
    completed += chunk.length;
    onProgress?.({ total, completed });
  }

  return { scanned: total, updated };
}
