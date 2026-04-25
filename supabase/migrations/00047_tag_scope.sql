-- ============================================================
-- SpellKeep — Tag scope (global vs collection-specific)
-- ============================================================
-- Tags now carry an optional `scope_collection_id`. NULL means the
-- tag is global and shows up in every binder/list/deck's picker;
-- non-null means the tag only exists in the context of that one
-- collection. Together with a trigger that validates
-- collection_card_tags inserts, this keeps scoped tags from leaking
-- into collections they weren't created for.
-- ============================================================

alter table tags
  add column scope_collection_id uuid null
    references collections(id) on delete cascade;

create index idx_tags_scope_collection on tags(scope_collection_id);

-- Replace the old unique index — name uniqueness is now scoped too.
-- Two tags can share a name if one is global and the other is
-- scoped, or if they're scoped to different collections.
drop index if exists idx_tags_user_name_lower;
create unique index idx_tags_user_scope_name_lower
  on tags(
    user_id,
    coalesce(scope_collection_id::text, ''),
    lower(name)
  );

-- ============================================================
-- Validate tag application against collection scope
-- ============================================================
-- A scoped tag can only be attached to rows that live in the same
-- collection. Global tags (scope is NULL) are always allowed.
create or replace function validate_collection_card_tag_scope()
returns trigger as $$
declare
  v_tag_scope uuid;
  v_card_collection uuid;
begin
  select scope_collection_id into v_tag_scope
    from tags where id = NEW.tag_id;

  if v_tag_scope is null then
    return NEW; -- global
  end if;

  select collection_id into v_card_collection
    from collection_cards where id = NEW.collection_card_id;

  if v_card_collection is distinct from v_tag_scope then
    raise exception 'tag_scope_mismatch'
      using errcode = 'check_violation',
            hint = 'This tag only applies inside its own collection.';
  end if;

  return NEW;
end;
$$ language plpgsql
   set search_path = public, pg_catalog;

create trigger trg_collection_card_tags_scope
  before insert or update on collection_card_tags
  for each row execute function validate_collection_card_tag_scope();
