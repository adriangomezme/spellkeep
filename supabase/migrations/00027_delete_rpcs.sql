-- Server-side deletes so a 100k-card binder doesn't have to flow through
-- PowerSync's CRUD queue as 100k individual ops. One SQL statement; the
-- client sees the deletions propagate back via the sync stream.

create or replace function sp_delete_collection(
  p_collection_id uuid
) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_removed int := 0;
begin
  if not exists (
    select 1 from collections
    where id = p_collection_id and user_id = v_user
  ) then
    raise exception 'collection not found or not owned by caller';
  end if;

  with deleted as (
    delete from collection_cards
    where collection_id = p_collection_id
    returning 1
  )
  select count(*)::int into v_removed from deleted;

  delete from collections where id = p_collection_id;

  return v_removed;
end;
$$;

create or replace function sp_delete_folder_with_contents(
  p_folder_id uuid
) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_removed int := 0;
begin
  if not exists (
    select 1 from collection_folders
    where id = p_folder_id and user_id = v_user
  ) then
    raise exception 'folder not found or not owned by caller';
  end if;

  -- Remove card rows first so the single cascade doesn't loop a trigger
  -- per row. Collection_cards cascades out via FK on collection_id.
  with deleted as (
    delete from collection_cards
    where collection_id in (
      select id from collections where folder_id = p_folder_id and user_id = v_user
    )
    returning 1
  )
  select count(*)::int into v_removed from deleted;

  delete from collections where folder_id = p_folder_id and user_id = v_user;
  delete from collection_folders where id = p_folder_id and user_id = v_user;

  return v_removed;
end;
$$;

grant execute on function sp_delete_collection(uuid) to authenticated;
grant execute on function sp_delete_folder_with_contents(uuid) to authenticated;
