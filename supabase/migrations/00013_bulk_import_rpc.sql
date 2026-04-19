-- Atomic bulk upsert for collection imports. Client sends resolved rows in
-- chunks; one SQL statement per chunk replaces the previous per-row
-- select+insert/update pattern (which was O(N) network round-trips).
--
-- Payload shape:
--   p_rows = jsonb array, each element:
--     { "card_id": uuid,
--       "condition": text,
--       "quantity_normal": int,
--       "quantity_foil": int,
--       "quantity_etched": int,
--       "purchase_price": numeric | null }
--
-- Conflict key: (collection_id, card_id, condition). On conflict, quantities
-- are summed and purchase_price is last-write-wins (only if provided).

create or replace function sp_bulk_upsert_collection_cards(
  p_collection_id uuid,
  p_rows jsonb
) returns table (inserted int, updated int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted int := 0;
  v_updated int := 0;
begin
  -- Ownership check: the caller must own the target collection. RLS on
  -- collection_cards would also enforce this per-row, but doing it upfront
  -- gives a clean error and avoids partial writes on a bad collection_id.
  if not exists (
    select 1 from collections
    where id = p_collection_id
      and user_id = auth.uid()
  ) then
    raise exception 'collection not found or not owned by caller';
  end if;

  with input as (
    select
      (elem->>'card_id')::uuid          as card_id,
      coalesce(elem->>'condition','NM') as condition,
      coalesce((elem->>'quantity_normal')::int, 0) as qn,
      coalesce((elem->>'quantity_foil')::int, 0)   as qf,
      coalesce((elem->>'quantity_etched')::int, 0) as qe,
      case
        when elem ? 'purchase_price' and elem->>'purchase_price' is not null
        then (elem->>'purchase_price')::numeric
        else null
      end as purchase_price
    from jsonb_array_elements(p_rows) elem
  ),
  -- Pre-aggregate within the payload so duplicate rows for the same
  -- (card_id, condition) collapse to a single upsert. This avoids ON
  -- CONFLICT firing multiple times for the same key in one statement
  -- (Postgres forbids that).
  deduped as (
    select
      card_id,
      condition,
      sum(qn)::int as qn,
      sum(qf)::int as qf,
      sum(qe)::int as qe,
      -- last-write-wins for price when the same key is present twice
      (array_agg(purchase_price order by (purchase_price is null)))[1] as purchase_price
    from input
    group by card_id, condition
  ),
  upserted as (
    insert into collection_cards (
      collection_id, card_id, condition,
      quantity_normal, quantity_foil, quantity_etched,
      purchase_price
    )
    select
      p_collection_id, d.card_id, d.condition,
      d.qn, d.qf, d.qe,
      d.purchase_price
    from deduped d
    where d.qn + d.qf + d.qe > 0
    on conflict (collection_id, card_id, condition) do update
      set
        quantity_normal = collection_cards.quantity_normal + excluded.quantity_normal,
        quantity_foil   = collection_cards.quantity_foil   + excluded.quantity_foil,
        quantity_etched = collection_cards.quantity_etched + excluded.quantity_etched,
        purchase_price  = coalesce(excluded.purchase_price, collection_cards.purchase_price),
        updated_at      = now()
    returning (xmax = 0) as was_inserted
  )
  select
    count(*) filter (where was_inserted)::int,
    count(*) filter (where not was_inserted)::int
  into v_inserted, v_updated
  from upserted;

  inserted := v_inserted;
  updated  := v_updated;
  return next;
end;
$$;

grant execute on function sp_bulk_upsert_collection_cards(uuid, jsonb) to authenticated;
