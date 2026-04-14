-- ============================================================
-- SpellKeep - Row Level Security Policies
-- ============================================================

-- ============================================================
-- Cards & Sets: Public read, no user writes (Scryfall sync only)
-- ============================================================

alter table cards enable row level security;
alter table sets enable row level security;

create policy "Cards are publicly readable"
  on cards for select
  using (true);

create policy "Sets are publicly readable"
  on sets for select
  using (true);

-- ============================================================
-- Profiles
-- ============================================================

alter table profiles enable row level security;

create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

-- ============================================================
-- Collections
-- ============================================================

alter table collections enable row level security;

create policy "Users can view their own collections"
  on collections for select
  using (auth.uid() = user_id);

create policy "Users can view public collections"
  on collections for select
  using (is_public = true);

create policy "Users can view shared collections via token"
  on collections for select
  using (share_token is not null);

create policy "Users can create their own collections"
  on collections for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own collections"
  on collections for update
  using (auth.uid() = user_id);

create policy "Users can delete their own collections"
  on collections for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Collection Cards
-- ============================================================

alter table collection_cards enable row level security;

create policy "Users can view their own collection cards"
  on collection_cards for select
  using (
    exists (
      select 1 from collections
      where collections.id = collection_cards.collection_id
      and collections.user_id = auth.uid()
    )
  );

create policy "Users can view public collection cards"
  on collection_cards for select
  using (
    exists (
      select 1 from collections
      where collections.id = collection_cards.collection_id
      and (collections.is_public = true or collections.share_token is not null)
    )
  );

create policy "Users can insert their own collection cards"
  on collection_cards for insert
  with check (
    exists (
      select 1 from collections
      where collections.id = collection_cards.collection_id
      and collections.user_id = auth.uid()
    )
  );

create policy "Users can update their own collection cards"
  on collection_cards for update
  using (
    exists (
      select 1 from collections
      where collections.id = collection_cards.collection_id
      and collections.user_id = auth.uid()
    )
  );

create policy "Users can delete their own collection cards"
  on collection_cards for delete
  using (
    exists (
      select 1 from collections
      where collections.id = collection_cards.collection_id
      and collections.user_id = auth.uid()
    )
  );

-- ============================================================
-- Decks
-- ============================================================

alter table decks enable row level security;

create policy "Users can view their own decks"
  on decks for select
  using (auth.uid() = user_id);

create policy "Users can view public decks"
  on decks for select
  using (visibility = 'public');

create policy "Users can view shared decks via token"
  on decks for select
  using (share_token is not null);

create policy "Users can create their own decks"
  on decks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own decks"
  on decks for update
  using (auth.uid() = user_id);

create policy "Users can delete their own decks"
  on decks for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Deck Cards
-- ============================================================

alter table deck_cards enable row level security;

create policy "Users can view their own deck cards"
  on deck_cards for select
  using (
    exists (
      select 1 from decks
      where decks.id = deck_cards.deck_id
      and decks.user_id = auth.uid()
    )
  );

create policy "Users can view public deck cards"
  on deck_cards for select
  using (
    exists (
      select 1 from decks
      where decks.id = deck_cards.deck_id
      and (decks.visibility = 'public' or decks.share_token is not null)
    )
  );

create policy "Users can insert their own deck cards"
  on deck_cards for insert
  with check (
    exists (
      select 1 from decks
      where decks.id = deck_cards.deck_id
      and decks.user_id = auth.uid()
    )
  );

create policy "Users can update their own deck cards"
  on deck_cards for update
  using (
    exists (
      select 1 from decks
      where decks.id = deck_cards.deck_id
      and decks.user_id = auth.uid()
    )
  );

create policy "Users can delete their own deck cards"
  on deck_cards for delete
  using (
    exists (
      select 1 from decks
      where decks.id = deck_cards.deck_id
      and decks.user_id = auth.uid()
    )
  );

-- ============================================================
-- Deck Folders
-- ============================================================

alter table deck_folders enable row level security;

create policy "Users can manage their own deck folders"
  on deck_folders for all
  using (auth.uid() = user_id);

-- ============================================================
-- Scan History
-- ============================================================

alter table scan_history enable row level security;

create policy "Users can manage their own scan history"
  on scan_history for all
  using (auth.uid() = user_id);
