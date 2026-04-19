-- Import RPC now returns total card quantities (sum of qty_normal +
-- qty_foil + qty_etched) instead of distinct variants for the
-- imported/updated counters. The user wants the displayed number to
-- match the physical cards they intended to import — variant counts
-- felt like cards were lost.
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
  )
  select
    coalesce(sum(d.qn + d.qf + d.qe) filter (where u.was_inserted), 0)::int,
    coalesce(sum(d.qn + d.qf + d.qe) filter (where not u.was_inserted), 0)::int
  into v_inserted, v_updated
  from upserted u
  join deduped d
    on d.card_id = u.card_id
   and d.condition = u.condition
   and d.language = u.language;

  inserted := v_inserted;
  updated  := v_updated;
  return next;
end;
$$;
