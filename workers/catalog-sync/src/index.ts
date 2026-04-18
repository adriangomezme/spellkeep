import { finishSyncRun, startSyncRun } from './db.ts';
import { getBulkData } from './scryfall.ts';
import { syncSets } from './steps/sets.ts';
import { syncCards } from './steps/cards.ts';
import { buildDelta } from './steps/delta.ts';
import { buildSnapshot } from './steps/snapshot.ts';
import { config } from './config.ts';

async function main() {
  console.log('[catalog-sync] starting run');

  const bulk = await getBulkData('default_cards');
  console.log(`[catalog-sync] scryfall bulk updated_at=${bulk.updated_at} size=${bulk.size}`);

  const runId = await startSyncRun(bulk.updated_at);
  const runStartedAt = new Date().toISOString();

  try {
    const setsResult = await syncSets();
    console.log(`[catalog-sync] sets: upserted=${setsResult.upserted}`);

    const cardsResult = await syncCards(bulk.download_uri);
    console.log(`[catalog-sync] cards: processed=${cardsResult.processed}`);

    let deltaUrl: string | null = null;
    if (!config.skipDelta) {
      deltaUrl = await buildDelta(runStartedAt);
      console.log(`[catalog-sync] delta: ${deltaUrl ?? 'skipped (no prior baseline)'}`);
    }

    let snapshotUrl: string | null = null;
    if (!config.skipSnapshot) {
      snapshotUrl = await buildSnapshot();
      console.log(`[catalog-sync] snapshot: ${snapshotUrl ?? 'skipped (not due)'}`);
    }

    await finishSyncRun(runId, {
      status: 'succeeded',
      cards_inserted: cardsResult.inserted,
      cards_updated: cardsResult.updated,
      sets_upserted: setsResult.upserted,
      delta_url: deltaUrl,
      snapshot_url: snapshotUrl,
    });

    console.log('[catalog-sync] done');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[catalog-sync] FAILED: ${message}`);
    await finishSyncRun(runId, { status: 'failed', error_message: message });
    process.exit(1);
  }
}

main();
