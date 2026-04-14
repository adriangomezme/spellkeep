-- ============================================================
-- SpellKeep - Initial Schema
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- LAYER 1: Card Data (Scryfall sync - read only for users)
-- ============================================================

create table sets (
  id uuid primary key default uuid_generate_v4(),
  scryfall_id text unique not null,
  code text unique not null,
  name text not null,
  set_type text,
  released_at date,
  card_count integer default 0,
  icon_svg_uri text,
  updated_at timestamptz default now()
);

create index idx_sets_code on sets(code);

create table cards (
  id uuid primary key default uuid_generate_v4(),
  scryfall_id text unique not null,
  oracle_id text not null,
  name text not null,
  mana_cost text,
  cmc numeric default 0,
  type_line text,
  oracle_text text,
  colors text[] default '{}',
  color_identity text[] default '{}',
  keywords text[] default '{}',
  power text,
  toughness text,
  loyalty text,
  rarity text,
  set_code text not null,
  set_name text,
  collector_number text not null,
  image_uri_small text,
  image_uri_normal text,
  image_uri_large text,
  image_uri_art_crop text,
  price_usd numeric,
  price_usd_foil numeric,
  price_eur numeric,
  price_eur_foil numeric,
  legalities jsonb default '{}',
  released_at date,
  artist text,
  is_legendary boolean default false,
  produced_mana text[] default '{}',
  layout text default 'normal',
  card_faces jsonb,
  updated_at timestamptz default now()
);

create index idx_cards_oracle_id on cards(oracle_id);
create index idx_cards_name on cards(name);
create index idx_cards_set_code on cards(set_code);
create index idx_cards_name_collector on cards(name, collector_number);
create index idx_cards_set_collector on cards(set_code, collector_number);
create index idx_cards_rarity on cards(rarity);
create index idx_cards_cmc on cards(cmc);
create index idx_cards_color_identity on cards using gin(color_identity);

-- ============================================================
-- LAYER 2: User Profiles
-- ============================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_anonymous boolean default true,
  username text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-create profile on user signup (works for anonymous too)
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, is_anonymous)
  values (new.id, new.is_anonymous);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- LAYER 3: Collections
-- ============================================================

create table collections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  type text not null default 'collection' check (type in ('collection', 'binder', 'list')),
  description text,
  is_public boolean default false,
  share_token text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_collections_user on collections(user_id);
create index idx_collections_share_token on collections(share_token) where share_token is not null;

-- Auto-create default collection for new users
create or replace function handle_new_profile()
returns trigger as $$
begin
  insert into public.collections (user_id, name, type)
  values (new.id, 'My Collection', 'collection');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_profile_created
  after insert on profiles
  for each row execute function handle_new_profile();

create table collection_cards (
  id uuid primary key default uuid_generate_v4(),
  collection_id uuid not null references collections(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  condition text not null default 'NM' check (condition in ('NM', 'LP', 'MP', 'HP', 'DMG')),
  quantity_normal integer not null default 0,
  quantity_foil integer not null default 0,
  quantity_etched integer not null default 0,
  tags text[] default '{}',
  notes text,
  added_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (collection_id, card_id, condition)
);

create index idx_collection_cards_collection on collection_cards(collection_id);
create index idx_collection_cards_card on collection_cards(card_id);

-- Ensure at least one quantity is > 0
alter table collection_cards
  add constraint chk_quantity_positive
  check (quantity_normal + quantity_foil + quantity_etched > 0);

-- ============================================================
-- LAYER 4: Decks
-- ============================================================

create table deck_folders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  parent_folder_id uuid references deck_folders(id) on delete cascade,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_deck_folders_user on deck_folders(user_id);

create table decks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  folder_id uuid references deck_folders(id) on delete set null,
  name text not null,
  description text,
  format text not null default 'commander'
    check (format in ('commander', 'standard', 'modern', 'pioneer', 'legacy', 'vintage', 'pauper', 'custom')),
  commander_card_id uuid references cards(id),
  companion_card_id uuid references cards(id),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  share_token text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_decks_user on decks(user_id);
create index idx_decks_folder on decks(folder_id);
create index idx_decks_share_token on decks(share_token) where share_token is not null;

create table deck_cards (
  id uuid primary key default uuid_generate_v4(),
  deck_id uuid not null references decks(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  board text not null default 'main' check (board in ('main', 'sideboard', 'maybeboard')),
  custom_tag text,
  added_at timestamptz default now()
);

create index idx_deck_cards_deck on deck_cards(deck_id);
create index idx_deck_cards_card on deck_cards(card_id);

-- ============================================================
-- LAYER 5: Scan History
-- ============================================================

create table scan_history (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  card_id uuid references cards(id),
  confidence numeric,
  action_taken text check (action_taken in ('added_to_collection', 'added_to_deck', 'dismissed')),
  target_id uuid,
  scanned_at timestamptz default now(),
  image_uri text
);

create index idx_scan_history_user on scan_history(user_id);

-- ============================================================
-- updated_at trigger function
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply updated_at triggers
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function update_updated_at();
create trigger trg_collections_updated_at before update on collections
  for each row execute function update_updated_at();
create trigger trg_collection_cards_updated_at before update on collection_cards
  for each row execute function update_updated_at();
create trigger trg_decks_updated_at before update on decks
  for each row execute function update_updated_at();
create trigger trg_deck_folders_updated_at before update on deck_folders
  for each row execute function update_updated_at();
