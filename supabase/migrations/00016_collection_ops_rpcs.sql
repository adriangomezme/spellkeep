-- Server-side duplicate / merge / empty. Each previous client-side
-- implementation did a round-trip per row (PostgREST truncated the fetch
-- at 1000 rows too, so big collections silently lost data). These RPCs
-- each run as one SQL statement so 100k-row collections finish in the
-- same time as 100-row ones.
--
-- Ownership: security invoker + explicit user_id checks mean RLS still
-- enforces the caller can only touch their own collections.

-- ── Duplicate ────────────────────────────────────────────────────────────
-- Returns the new collection id. The caller decides the new name so
-- we don't hard-code " Copy" here and can support rename-on-duplicate
-- flows later.
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
begin
  select * into v_source
  from collections
  where id = p_source_id and user_id = auth.uid();
  if not found then
    raise exception 'collection not found or not owned by caller';
  end if;

  insert into collections (user_id, name, type, folder_id, color, description)
  values (
    auth.uid(),
    coalesce(nullif(p_new_name, ''), v_source.name || ' Copy'),
    v_source.type,
    v_source.folder_id,
    v_source.color,
    v_source.description
  )
  returning id into v_new_id;

  insert into collection_cards (
    collection_id, card_id, condition, language,
    quantity_normal, quantity_foil, quantity_etched,
    tags, notes, purchase_price, added_at
  )
  select
    v_new_id, card_id, condition, language,
    quantity_normal, quantity_foil, quantity_etched,
    tags, notes, purchase_price, added_at
  from collection_cards
  where collection_id = p_source_id;

  return v_new_id;
end;
$$;

-- ── Merge ────────────────────────────────────────────────────────────────
-- Destination absorbs source; quantities sum on conflict. Source is then
-- deleted (cascade removes the merged child rows). Returns the number of
-- distinct (card_id, condition, language) tuples merged.
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
begin
  if not exists (
    select 1 from collections
    where id = p_source_id and user_id = auth.uid()
  ) then
    raise exception 'source collection not found or not owned by caller';
  end if;
  if not exists (
    select 1 from collections
    where id = p_dest_id and user_id = auth.uid()
  ) then
    raise exception 'destination collection not found or not owned by caller';
  end if;
  if p_source_id = p_dest_id then
    raise exception 'cannot merge a collection into itself';
  end if;

  with moved as (
    insert into collection_cards (
      collection_id, card_id, condition, language,
      quantity_normal, quantity_foil, quantity_etched,
      tags, notes, purchase_price
    )
    select
      p_dest_id, card_id, condition, language,
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

  -- Source must exist in an owned collection (checked above) — cascade
  -- on collection_cards.collection_id will clean any source children that
  -- might still be left over (shouldn't happen, but belt-and-braces).
  delete from collections where id = p_source_id;

  return v_moved;
end;
$$;

-- ── Empty ────────────────────────────────────────────────────────────────
-- Clears every card from the collection but keeps the collection row
-- intact (name, color, folder, type, description untouched). Returns
-- how many collection_cards rows were removed so the UI can show a
-- confirmation like "Removed 12,345 entries".
create or replace function sp_empty_collection(
  p_collection_id uuid
) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_removed int := 0;
begin
  if not exists (
    select 1 from collections
    where id = p_collection_id and user_id = auth.uid()
  ) then
    raise exception 'collection not found or not owned by caller';
  end if;

  with deleted as (
    delete from collection_cards
    where collection_id = p_collection_id
    returning 1
  )
  select count(*)::int into v_removed from deleted;

  return v_removed;
end;
$$;

grant execute on function sp_duplicate_collection(uuid, text) to authenticated;
grant execute on function sp_merge_collections(uuid, uuid) to authenticated;
grant execute on function sp_empty_collection(uuid) to authenticated;
