import { config } from './config.ts';
import {
  fetchTopCommanders,
  sleep,
  type CommanderWindow,
} from './edhrec.ts';
import { resolveCommanders } from './resolve.ts';
import { replaceWindow } from './upsert.ts';

const WINDOWS: CommanderWindow[] = ['week', 'month', 'two-years'];

async function main() {
  console.log(
    `[commander-sync] starting run topN=${config.topN} windows=${WINDOWS.join(',')}`
  );

  const summary: Record<string, { fetched: number; inserted: number }> = {};

  for (let i = 0; i < WINDOWS.length; i++) {
    const window = WINDOWS[i]!;
    try {
      console.log(`[commander-sync] window=${window} fetching…`);
      const raw = await fetchTopCommanders(window, config.topN);
      console.log(`[commander-sync] window=${window} fetched=${raw.length}`);

      const entries = raw.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.sanitized,
      }));
      const resolved = await resolveCommanders(entries);
      console.log(
        `[commander-sync] window=${window} resolved=${resolved.length}/${raw.length}`
      );

      // Re-rank densely 1..N after resolution so PK stays clean. The
      // EDHREC rank gaps from skipped entries (partners, missing) get
      // collapsed — the app only cares about relative order anyway.
      const ranked = resolved
        .slice(0, config.topN)
        .map((r, idx) => ({ ...r, rank: idx + 1 }));

      const { inserted } = await replaceWindow(window, ranked);
      summary[window] = { fetched: raw.length, inserted };
      console.log(`[commander-sync] window=${window} inserted=${inserted}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[commander-sync] window=${window} FAILED: ${msg}`);
      summary[window] = { fetched: 0, inserted: 0 };
    }

    // Polite pause between window fetches so we're not hammering
    // EDHREC. The 5-day cron cadence already keeps total volume low.
    if (i < WINDOWS.length - 1) {
      await sleep(config.betweenFetchSleepMs);
    }
  }

  console.log(
    `[commander-sync] done summary=${JSON.stringify(summary)}`
  );
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[commander-sync] FATAL: ${msg}`);
  process.exit(1);
});
