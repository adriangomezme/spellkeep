import { finishSyncRun, startSyncRun } from './db.ts';
import { getBulkData } from './scryfall.ts';
import { syncSets } from './steps/sets.ts';
import { syncCards } from './steps/cards.ts';
import { buildSnapshot } from './steps/snapshot.ts';
import { refreshAlertedPrices } from './steps/refreshAlertedPrices.ts';
import { evaluatePriceAlerts } from './steps/evaluateAlerts.ts';
import { sendPushForTriggered } from './steps/sendPush.ts';
import { config } from './config.ts';

async function main() {
  console.log(`[catalog-sync] starting run (alertsOnly=${config.alertsOnly})`);

  if (config.alertsOnly) {
    // Light sweep: no bulk download, no snapshot. Just refresh the prices
    // of alerted cards via Scryfall's individual endpoint and evaluate.
    await refreshAlertedPrices();
    const triggered = await evaluatePriceAlerts();
    const push = await sendPushForTriggered(triggered);
    console.log(
      `[catalog-sync] alerts-only done: triggered=${triggered.length} pushSent=${push.sent} pruned=${push.pruned}`
    );
    return;
  }

  const bulk = await getBulkData('default_cards');
  console.log(`[catalog-sync] scryfall bulk updated_at=${bulk.updated_at} size=${bulk.size}`);

  const runId = await startSyncRun(bulk.updated_at);

  try {
    const setsResult = await syncSets();
    console.log(`[catalog-sync] sets: upserted=${setsResult.upserted}`);

    const cardsResult = await syncCards(bulk.download_uri);
    console.log(`[catalog-sync] cards: processed=${cardsResult.processed}`);

    // Bulk just wrote fresh prices to `cards`, so we evaluate directly —
    // no need to re-fetch via the individual endpoint here.
    const triggered = await evaluatePriceAlerts();
    const push = await sendPushForTriggered(triggered);
    console.log(
      `[catalog-sync] alerts: triggered=${triggered.length} pushSent=${push.sent} pruned=${push.pruned}`
    );

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
