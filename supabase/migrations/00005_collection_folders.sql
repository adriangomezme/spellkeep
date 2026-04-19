-- ============================================================
-- SpellKeep - Collection Folders + Binder/List Migration
-- ============================================================

-- ============================================================
-- 1. Create collection_folders table
-- ============================================================

create table collection_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_collection_folders_user on collection_folders(user_id);

alter table collection_folders enable row level security;

create policy "Users can manage their own collection folders"
  on collection_folders for all
  using (auth.uid() = user_id);

create trigger trg_collection_folders_updated_at before update on collection_folders
  for each row execute function update_updated_at();

-- ============================================================
-- 2. Add folder_id to collections
-- ============================================================

alter table collections
  add column folder_id uuid references collection_folders(id) on delete set null;

-- ============================================================
-- 3. Migrate existing data: convert type='collection' to binder
-- ============================================================

update collections
  set type = 'binder', name = 'My Cards'
  where type = 'collection';

-- Remove 'collection' from the check constraint, it's no longer a valid type
alter table collections drop constraint collections_type_check;
alter table collections add constraint collections_type_check
  check (type in ('binder', 'list'));

-- ============================================================
-- 4. Update auto-create trigger for new users
-- ============================================================

create or replace function handle_new_profile()
returns trigger as $$
begin
  insert into public.collections (user_id, name, type)
  values (new.id, 'My Cards', 'binder');
  return new;
end;
$$ language plpgsql security definer;

-- ============================================================
-- 5. Add PowerSync sync for collection_folders
-- (sync rules are in powersync/sync-streams.yaml, not SQL)
-- ============================================================
