-- ============================================================
-- SpellKeep — Tags
-- ============================================================
-- Tags are user-scoped labels (name + color) that apply to specific
-- `collection_cards` rows — i.e. a tag belongs to the copy in a given
-- binder/list, not to the abstract card. The same Scryfall card can
-- therefore have different tags in different collections.
--
-- This migration also drops the dormant `collection_cards.tags` JSON
-- column (migration 00000_initial, never populated) in favor of a
-- proper join table.
-- ============================================================

-- ---------- tags catalog ----------

create table tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  color text,  -- optional HEX like '#0A2385'; null = default/neutral
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive uniqueness: "aggro" and "Aggro" collide for a given
-- user. Display preserves original case; uniqueness is normalized.
create unique index idx_tags_user_name_lower on tags(user_id, lower(name));
create index idx_tags_user on tags(user_id);

create trigger trg_tags_updated_at
  before update on tags
  for each row execute function update_updated_at();

alter table tags enable row level security;

create policy "Users manage their own tags"
  on tags for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- collection_card_tags join ----------

-- `user_id` is denormalized so the PowerSync stream can filter via
-- `WHERE user_id = auth.user_id()` without a parameter subquery —
-- the subquery path trips PowerSync edition-3's 1000-row cap (see
-- the "NOTE" block at the bottom of powersync/sync-streams.yaml).
create table collection_card_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  collection_card_id uuid not null references collection_cards(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index idx_collection_card_tags_unique
  on collection_card_tags(collection_card_id, tag_id);
create index idx_collection_card_tags_user on collection_card_tags(user_id);
create index idx_collection_card_tags_card on collection_card_tags(collection_card_id);
create index idx_collection_card_tags_tag on collection_card_tags(tag_id);

alter table collection_card_tags enable row level security;

create policy "Users manage their own collection card tags"
  on collection_card_tags for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- PowerSync publication ----------

alter publication powersync add table public.tags;
alter publication powersync add table public.collection_card_tags;

-- ---------- Drop dormant JSON column ----------

alter table collection_cards drop column if exists tags;
