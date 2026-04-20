-- Rewrites the duplicate and merge RPCs so they populate user_id in
-- the INSERT directly. Without this the BEFORE-INSERT trigger added in
-- migration 00024 runs once per row and does a SELECT against
-- `collections` each time — for a 21k-card duplicate that's 21k extra
-- lookups, turning a sub-second op into tens of seconds.

create or replace function sp_duplicate_collection(
  p_source_id uuid,
  p_new_name text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source collections%rowtype;
  v_new_id uuid;
  v_user uuid := auth.uid();
begin
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
security invoker
set search_path = public
as $$
declare
  v_moved int := 0;
  v_user uuid := auth.uid();
begin
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

grant execute on function sp_duplicate_collection(uuid, text) to authenticated;
grant execute on function sp_merge_collections(uuid, uuid) to authenticated;
