-- Bulk price updater used by the catalog-sync worker's alerts sweep.
-- We can't use supabase-js `upsert` for this because Postgres evaluates
-- NOT NULL constraints on the prospective INSERT row before resolving
-- ON CONFLICT → supplying only {scryfall_id, price_usd, price_usd_foil,
-- price_usd_etched, updated_at} trips the NOT NULL on oracle_id.

create or replace function sp_update_card_prices(rows jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  cnt int;
begin
  update cards c set
    price_usd        = nullif(r->>'price_usd', '')::double precision,
    price_usd_foil   = nullif(r->>'price_usd_foil', '')::double precision,
    price_usd_etched = nullif(r->>'price_usd_etched', '')::double precision,
    updated_at       = coalesce(nullif(r->>'updated_at', '')::timestamptz, now())
  from jsonb_array_elements(rows) r
  where c.scryfall_id = r->>'scryfall_id';
  get diagnostics cnt = row_count;
  return cnt;
end;
$$;
