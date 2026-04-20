-- Same trigger-skipping treatment as 00025 for the import path so a
-- 100k-line CSV isn't hamstrung by the user_id trigger running 100k
-- SELECTs during ingest.

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
  v_user uuid := auth.uid();
begin
  if not exists (
    select 1 from collections
    where id = p_collection_id
      and user_id = v_user
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
      user_id, collection_id, card_id, condition, language,
      quantity_normal, quantity_foil, quantity_etched,
      purchase_price
    )
    select
      v_user, p_collection_id, d.card_id, d.condition, d.language,
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
      coalesce(i.qn, 0) as qn,
      coalesce(i.qf, 0) as qf,
      coalesce(i.qe, 0) as qe
    from upserted u
    left join deduped i
      on i.card_id = u.card_id
     and i.condition = u.condition
     and i.language = u.language
  )
  select
    sum(case when was_inserted then (qn + qf + qe) else 0 end)::int,
    sum(case when was_inserted then 0 else (qn + qf + qe) end)::int,
    sum(case when was_inserted then 1 else 0 end)::int,
    sum(case when was_inserted then 0 else 1 end)::int
  into v_inserted, v_updated, v_ivariants, v_uvariants
  from joined;

  return query select v_inserted, v_updated, v_ivariants, v_uvariants;
end;
$$;

grant execute on function sp_bulk_upsert_collection_cards(uuid, jsonb) to authenticated;
