import { db } from '../powersync/system';

export type PriceOverride = {
  price_usd: number | null;
  price_usd_foil: number | null;
  refreshed_at: string;
};

type OverrideRow = {
  scryfall_id: string;
  price_usd: number | null;
  price_usd_foil: number | null;
  refreshed_at: string;
};

let overrides = new Map<string, PriceOverride>();
let latestRefreshedAt: string | null = null;
let isInitialized = false;
let unwatch: (() => void) | null = null;
const changeListeners = new Set<() => void>();

async function reload(): Promise<void> {
  const rows = await db.getAll<OverrideRow>(
    `SELECT scryfall_id, price_usd, price_usd_foil, refreshed_at FROM price_overrides`
  );
  const next = new Map<string, PriceOverride>();
  let latest: string | null = null;
  for (const row of rows) {
    next.set(row.scryfall_id, {
      price_usd: row.price_usd,
      price_usd_foil: row.price_usd_foil,
      refreshed_at: row.refreshed_at,
    });
    if (!latest || row.refreshed_at > latest) latest = row.refreshed_at;
  }
  overrides = next;
  latestRefreshedAt = latest;
  for (const l of changeListeners) l();
}

export async function initPriceOverrides(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;
  try {
    await reload();
  } catch (err) {
    console.warn('[priceOverrides] initial reload failed', err);
  }
  try {
    unwatch = db.onChange(
      {
        onChange: () => {
          reload().catch((err) => console.error('[priceOverrides] reload failed', err));
        },
      },
      { tables: ['price_overrides'], throttleMs: 500 }
    );
  } catch (err) {
    console.warn('[priceOverrides] onChange subscribe failed', err);
  }
}

export function getPriceOverride(scryfallId: string | null | undefined): PriceOverride | null {
  if (!scryfallId) return null;
  return overrides.get(scryfallId) ?? null;
}

export function getLatestOverrideAt(): string | null {
  return latestRefreshedAt;
}

export function subscribePriceOverrides(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

export async function clearAllPriceOverrides(): Promise<void> {
  await db.execute(`DELETE FROM price_overrides`);
}

export async function upsertPriceOverrides(
  rows: Array<{ scryfall_id: string; price_usd: number | null; price_usd_foil: number | null }>,
  refreshedAt: string
): Promise<void> {
  if (rows.length === 0) return;
  await db.writeTransaction(async (tx) => {
    for (const row of rows) {
      await tx.execute(
        `INSERT OR REPLACE INTO price_overrides
           (id, scryfall_id, price_usd, price_usd_foil, refreshed_at)
         VALUES (?, ?, ?, ?, ?)`,
        [row.scryfall_id, row.scryfall_id, row.price_usd, row.price_usd_foil, refreshedAt]
      );
    }
  });
}

export function __resetForTests(): void {
  overrides = new Map();
  latestRefreshedAt = null;
  isInitialized = false;
  unwatch?.();
  unwatch = null;
}
