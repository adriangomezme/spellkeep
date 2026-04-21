// Port of the shared alert math from src/lib/priceAlerts.ts. Keeps the
// worker and the client in lockstep so a triggered row on the server
// matches what the UI shows on a fresh client read.

export type PriceAlertDirection = 'below' | 'above';
export type PriceAlertMode = 'price' | 'percent';

/** Resolve the absolute target price (USD) from the alert spec. */
export function computeTargetUsd(
  snapshotPrice: number,
  mode: PriceAlertMode,
  direction: PriceAlertDirection,
  value: number
): number {
  if (mode === 'price') return value;
  // percent mode: `value` is an unsigned magnitude.
  const signed = direction === 'below' ? -Math.abs(value) : Math.abs(value);
  return snapshotPrice * (1 + signed / 100);
}

/** Did the current price cross the target in the alert's direction? */
export function hasCrossed(
  direction: PriceAlertDirection,
  currentPrice: number,
  targetPrice: number
): boolean {
  return direction === 'below' ? currentPrice <= targetPrice : currentPrice >= targetPrice;
}

/** Price column name for a given finish. */
export function priceColumnForFinish(finish: string): 'price_usd' | 'price_usd_foil' | 'price_usd_etched' {
  if (finish === 'foil') return 'price_usd_foil';
  if (finish === 'etched') return 'price_usd_etched';
  return 'price_usd';
}
