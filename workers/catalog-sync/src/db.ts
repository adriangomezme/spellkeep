import { supabase } from './supabase.ts';

/**
 * Upserts a batch of card rows with ON CONFLICT (scryfall_id) DO UPDATE.
 * Returns the number of rows the server accepted.
 */
export async function upsertCards(batch: Record<string, unknown>[]): Promise<number> {
  if (batch.length === 0) return 0;
  const { error } = await supabase
    .from('cards')
    .upsert(batch, { onConflict: 'scryfall_id' });
  if (error) throw new Error(`cards upsert failed: ${error.message}`);
  return batch.length;
}

export async function upsertSets(batch: Record<string, unknown>[]): Promise<number> {
  if (batch.length === 0) return 0;
  const { error } = await supabase
    .from('sets')
    .upsert(batch, { onConflict: 'code' });
  if (error) throw new Error(`sets upsert failed: ${error.message}`);
  return batch.length;
}

export async function startSyncRun(bulkUpdatedAt: string): Promise<string> {
  const { data, error } = await supabase
    .from('catalog_sync_runs')
    .insert({
      status: 'running',
      scryfall_bulk_updated_at: bulkUpdatedAt,
    })
    .select('id')
    .single();
  if (error) throw new Error(`sync run insert failed: ${error.message}`);
  return (data as { id: string }).id;
}

export async function finishSyncRun(
  runId: string,
  fields: {
    status: 'succeeded' | 'failed';
    cards_inserted?: number;
    cards_updated?: number;
    sets_upserted?: number;
    delta_url?: string | null;
    snapshot_url?: string | null;
    error_message?: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from('catalog_sync_runs')
    .update({
      status: fields.status,
      finished_at: new Date().toISOString(),
      cards_inserted: fields.cards_inserted ?? 0,
      cards_updated: fields.cards_updated ?? 0,
      sets_upserted: fields.sets_upserted ?? 0,
      delta_url: fields.delta_url ?? null,
      snapshot_url: fields.snapshot_url ?? null,
      error_message: fields.error_message ?? null,
    })
    .eq('id', runId);
  if (error) throw new Error(`sync run update failed: ${error.message}`);
}

export async function getLastSuccessfulRun(): Promise<{ id: string; started_at: string } | null> {
  const { data, error } = await supabase
    .from('catalog_sync_runs')
    .select('id, started_at')
    .eq('status', 'succeeded')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`last run fetch failed: ${error.message}`);
  return data as { id: string; started_at: string } | null;
}
