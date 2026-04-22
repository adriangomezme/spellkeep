-- ============================================================
-- SpellKeep - Sort preferences + custom sort_order columns
-- ============================================================
-- Adds per-user sort-mode columns on `profiles` (three independent
-- settings: folders, binders, lists) and a `sort_order` integer on
-- `collection_folders` and `collections`.
--
-- Default sort mode is 'created_desc' to match the order the Hub
-- currently shows. The `sort_order` columns are backfilled from
-- `created_at` with 1024-wide gaps so dragging between two existing
-- rows can pick a midpoint without renumbering.

-- ---------- profiles: sort-mode settings ----------

alter table profiles
  add column if not exists folder_sort_mode text not null default 'created_desc',
  add column if not exists binder_sort_mode text not null default 'created_desc',
  add column if not exists list_sort_mode   text not null default 'created_desc';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_sort_mode_check'
  ) then
    alter table profiles
      add constraint profiles_sort_mode_check check (
        folder_sort_mode in ('name_asc','name_desc','created_asc','created_desc','custom')
        and binder_sort_mode in ('name_asc','name_desc','created_asc','created_desc','custom')
        and list_sort_mode   in ('name_asc','name_desc','created_asc','created_desc','custom')
      );
  end if;
end $$;

-- ---------- sort_order columns ----------

alter table collection_folders add column if not exists sort_order integer not null default 0;
alter table collections        add column if not exists sort_order integer not null default 0;

-- ---------- backfill sort_order with 1024-wide gaps ----------
-- collection_folders: scope = user_id
update collection_folders cf
   set sort_order = sub.rn * 1024
  from (
    select id, row_number() over (partition by user_id order by created_at asc, id asc) as rn
      from collection_folders
  ) sub
 where cf.id = sub.id and cf.sort_order = 0;

-- collections: scope = (user_id, folder_id) — NULL folder_id = root
update collections c
   set sort_order = sub.rn * 1024
  from (
    select id, row_number() over (
             partition by user_id, coalesce(folder_id::text, '__root__')
             order by created_at asc, id asc
           ) as rn
      from collections
  ) sub
 where c.id = sub.id and c.sort_order = 0;
