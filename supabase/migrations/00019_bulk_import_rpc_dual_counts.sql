-- Return both totals: card quantities AND variant counts, so the UI can
-- show "X cards · Y unique" on the import result and in the import
-- history detail. Keeps the primary number (cards) aligned with the
-- user's CSV while still exposing the print×finish variants.

drop function if exists sp_bulk_upsert_collection_cards(uuid, jsonb);

create or replace function sp_bulk_upsert_collection_cards(
  p_collection_id uuid,
  p_rows jsonb
) returns table (
  inserted int,
  updated int,
  inserted_variants int,
  updated_variants int
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted int := 0;
  v_updated int := 0;
  v_ivariants int := 0;
  v_uvariants int := 0;
begin
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
      coalesce(elem->>'language','en')  as language,
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
  deduped as (
    select
      card_id,
      condition,
      language,
      sum(qn)::int as qn,
      sum(qf)::int as qf,
      sum(qe)::int as qe,
      (array_agg(purchase_price order by (purchase_price is null)))[1] as purchase_price
    from input
    group by card_id, condition, language
  ),
  upserted as (
    insert into collection_cards (
      collection_id, card_id, condition, language,
      quantity_normal, quantity_foil, quantity_etched,
      purchase_price
    )
    select
      p_collection_id, d.card_id, d.condition, d.language,
      d.qn, d.qf, d.qe,
      d.purchase_price
    from deduped d
    where d.qn + d.qf + d.qe > 0
    on conflict (collection_id, card_id, condition, language) do update
      set
        quantity_normal = collection_cards.quantity_normal + excluded.quantity_normal,
        quantity_foil   = collection_cards.quantity_foil   + excluded.quantity_foil,
        quantity_etched = collection_cards.quantity_etched + excluded.quantity_etched,
        purchase_price  = coalesce(excluded.purchase_price, collection_cards.purchase_price),
        updated_at      = now()
    returning
      card_id,
      condition,
      language,
      (xmax = 0) as was_inserted
  ),
  joined as (
    select
      u.was_inserted,
      d.qn + d.qf + d.qe as qty_total,
      (case when d.qn > 0 then 1 else 0 end)
      + (case when d.qf > 0 then 1 else 0 end)
      + (case when d.qe > 0 then 1 else 0 end) as variant_count
    from upserted u
    join deduped d
      on d.card_id = u.card_id
     and d.condition = u.condition
     and d.language = u.language
  )
  select
    coalesce(sum(qty_total) filter (where was_inserted), 0)::int,
    coalesce(sum(qty_total) filter (where not was_inserted), 0)::int,
    coalesce(sum(variant_count) filter (where was_inserted), 0)::int,
    coalesce(sum(variant_count) filter (where not was_inserted), 0)::int
  into v_inserted, v_updated, v_ivariants, v_uvariants
  from joined;

  inserted := v_inserted;
  updated  := v_updated;
  inserted_variants := v_ivariants;
  updated_variants  := v_uvariants;
  return next;
end;
$$;

grant execute on function sp_bulk_upsert_collection_cards(uuid, jsonb) to authenticated;
