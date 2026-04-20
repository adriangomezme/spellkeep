-- Add a dedicated etched-foil price column. Scryfall exposes this as
-- `prices.usd_etched`, and prints that only come as etched (most Secret
-- Lair showcase prints, e.g. Mox Opal SLD #1072) have the price there —
-- not in `prices.usd` or `prices.usd_foil`. Without this column those
-- rows showed $0.00 in the binder even though Scryfall has a price.

alter table cards add column if not exists price_usd_etched real;

create index if not exists idx_cards_price_usd_etched on cards (price_usd_etched)
  where price_usd_etched is not null;
