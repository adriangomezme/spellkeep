-- `SET session_replication_role = replica` requires superuser, which
-- postgres is NOT on Supabase (rolsuper=false). SECURITY DEFINER runs
-- the function as postgres, and postgres has rolbypassrls=true — so
-- per-row RLS checks are already skipped. The only thing we lose by
-- removing the replica line is the per-row trigger, which is now a
-- cheap early-return (user_id is provided explicitly so
-- `IF NEW.user_id IS NULL` is false).

create or replace function sp_duplicate_collection(
  p_source_id uuid,
  p_new_name text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source collections%rowtype;
  v_new_id uuid;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select * into v_source
  from collections
  where id = p_source_id and user_id = v_user;
  if not found then
    raise exception 'collection not found or not owned by caller';
  end if;

  insert into collections (user_id, name, type, folder_id, color, description)
  values (
    v_user,
    coalesce(nullif(p_new_name, ''), v_source.name || ' Copy'),
    v_source.type,
    v_source.folder_id,
    v_source.color,
    v_source.description
  )
  returning id into v_new_id;

  insert into collection_cards (
    user_id, collection_id, card_id, condition, language,
    quantity_normal, quantity_foil, quantity_etched,
    tags, notes, purchase_price, added_at
  )
  select
    v_user, v_new_id, card_id, condition, language,
    quantity_normal, quantity_foil, quantity_etched,
    tags, notes, purchase_price, added_at
  from collection_cards
  where collection_id = p_source_id;

  return v_new_id;
end;
$$;

create or replace function sp_merge_collections(
  p_source_id uuid,
  p_dest_id uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved int := 0;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from collections
    where id = p_source_id and user_id = v_user
  ) then
    raise exception 'source collection not found or not owned by caller';
  end if;
  if not exists (
    select 1 from collections
    where id = p_dest_id and user_id = v_user
  ) then
    raise exception 'destination collection not found or not owned by caller';
  end if;
  if p_source_id = p_dest_id then
    raise exception 'cannot merge a collection into itself';
  end if;

  with moved as (
    insert into collection_cards (
      user_id, collection_id, card_id, condition, language,
      quantity_normal, quantity_foil, quantity_etched,
      tags, notes, purchase_price
    )
    select
      v_user, p_dest_id, card_id, condition, language,
      quantity_normal, quantity_foil, quantity_etched,
      tags, notes, purchase_price
    from collection_cards
    where collection_id = p_source_id
    on conflict (collection_id, card_id, condition, language) do update
      set
        quantity_normal = collection_cards.quantity_normal + excluded.quantity_normal,
        quantity_foil   = collection_cards.quantity_foil   + excluded.quantity_foil,
        quantity_etched = collection_cards.quantity_etched + excluded.quantity_etched,
        updated_at      = now()
    returning 1
  )
  select count(*)::int into v_moved from moved;

  delete from collections where id = p_source_id;

  return v_moved;
end;
$$;

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
security definer
set search_path = public
as $$
declare
  v_inserted int := 0;
  v_updated int := 0;
  v_ivariants int := 0;
  v_uvariants int := 0;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

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

grant execute on function sp_duplicate_collection(uuid, text) to authenticated;
grant execute on function sp_merge_collections(uuid, uuid) to authenticated;
grant execute on function sp_bulk_upsert_collection_cards(uuid, jsonb) to authenticated;

-- Re-apply the statement_timeout override (ALTER FUNCTION settings get
-- reset when the function body is redefined via CREATE OR REPLACE).
alter function sp_duplicate_collection(uuid, text) set statement_timeout = '120s';
alter function sp_merge_collections(uuid, uuid) set statement_timeout = '120s';
alter function sp_bulk_upsert_collection_cards(uuid, jsonb) set statement_timeout = '120s';
