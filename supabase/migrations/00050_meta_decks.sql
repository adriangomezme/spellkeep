-- Meta decks feed sourced from MTGGoldfish.
--
-- The `meta-decks` worker scrapes MTGGoldfish's metagame index pages
-- (standard / modern / pioneer) every 5 days, takes the top 4
-- archetypes per format, downloads their "Exact Card Versions
-- (Tabletop)" decklist, parses it into a (qty, set, collector_number,
-- board) row set, resolves each line against the local `cards` table,
-- categorizes the card from `type_line`, and persists everything via
-- the admin_replace_meta_deck RPC below.
--
-- The Search hub's "Standard / Modern / Pioneer Meta" sections read
-- the synced data via PowerSync and render unique mainboard cards in
-- the carousel. The full deck (with quantities, sideboard, and
-- categories) is preserved here so the same data can power a future
-- "deck detail" view in the Decks tab without a schema migration.
--
-- Identity is `(format, slug)` — the slug comes from MTGGoldfish's
-- canonical archetype URL (e.g. `mono-green-landfall-woe`). Each run
-- replaces the cards for an archetype atomically; archetypes that
-- drop out of the top-4 are swept at the end of the run.

-- ────────────────────────────────────────────────────────────────────
-- meta_decks
-- ────────────────────────────────────────────────────────────────────
-- One row per archetype kept on the live "top decks" surface. The
-- `id` UUID is required for PowerSync edition-3 row bucketing
-- (composite PK collapses every row to the same partition — same
-- gotcha hit by `top_commanders` in 00048). Natural identity is
-- enforced via a unique constraint on (format, slug).
create table public.meta_decks (
  id uuid primary key default gen_random_uuid(),
  format text not null check (format in ('standard', 'modern', 'pioneer')),
  slug text not null,
  name text not null,
  -- Compact color identity string derived from mainboard cards
  -- (`'G'`, `'UR'`, `'WUBRG'`, `'C'`). Stored alongside the deck so
  -- the segmented control can render mana gems without re-aggregating
  -- on the device.
  colors text not null default '',
  archetype_url text not null,
  -- % of meta if MTGGoldfish exposes it on the index page (it
  -- usually does). NULL when the value can't be parsed reliably.
  meta_share numeric(5, 2),
  -- 1..4 ordering inside the format's segmented control. Lower wins.
  position smallint not null check (position between 1 and 8),
  refreshed_at timestamptz not null default now(),
  unique (format, slug)
);

comment on table public.meta_decks is
  'Top-N meta archetypes per format scraped from MTGGoldfish every 5 '
  'days by the meta-decks worker. Streamed globally to all signed-in '
  'clients via PowerSync.';
comment on column public.meta_decks.format is
  'Magic format: standard | modern | pioneer.';
comment on column public.meta_decks.slug is
  'MTGGoldfish archetype URL slug (e.g. mono-green-landfall-woe). '
  'Stable identity across worker runs unless MTGGoldfish renames it.';
comment on column public.meta_decks.colors is
  'Compact color identity derived from mainboard cards (e.g. WUBRG).';
comment on column public.meta_decks.position is
  '1-based ordering inside the format segment. The worker assigns it '
  'from the index page rank.';

create index meta_decks_format_position_idx
  on public.meta_decks (format, position);

-- ────────────────────────────────────────────────────────────────────
-- meta_deck_cards
-- ────────────────────────────────────────────────────────────────────
-- One row per (deck, card, board) tuple. `format` is denormalized
-- alongside `deck_id` so future code can WHERE format = ? without a
-- JOIN — same denormalization rule as `collection_cards.user_id` to
-- keep the future PowerSync sync stream out of the parameter-subquery
-- 1000-row cap (PSYNC_S2305).
--
-- A single card can appear on both the mainboard and the sideboard,
-- hence the `(deck_id, scryfall_id, board)` unique. Quantity captures
-- 1..4 of basics (or sideboard tech), and `category` lets the future
-- deck-detail view group by Creatures / Spells / Lands without
-- re-parsing type_line on the device.
create table public.meta_deck_cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.meta_decks (id) on delete cascade,
  format text not null,
  scryfall_id uuid not null,
  quantity smallint not null check (quantity between 1 and 60),
  board text not null check (board in ('main', 'side')),
  category text not null check (category in (
    'creatures',
    'planeswalkers',
    'spells',
    'artifacts',
    'enchantments',
    'battles',
    'lands',
    'sideboard'
  )),
  position smallint not null check (position between 0 and 1000),
  refreshed_at timestamptz not null default now(),
  unique (deck_id, scryfall_id, board)
);

comment on table public.meta_deck_cards is
  'Card list for each meta deck. Quantities + sideboard + categories '
  'preserved so the same rows power the discovery carousel today and '
  'a full deck-detail view in the future.';
comment on column public.meta_deck_cards.format is
  'Denormalized from the parent deck so the future PowerSync stream '
  'can filter without joining (avoids PSYNC_S2305 cap).';
comment on column public.meta_deck_cards.quantity is
  'Number of copies in the list. 1..4 in singleton-aware formats; '
  'higher only for basic lands.';
comment on column public.meta_deck_cards.board is
  'main | side. Sideboard rows are always category = sideboard '
  'regardless of card type.';
comment on column public.meta_deck_cards.category is
  'Display group. Derived from cards.type_line during the worker run.';

create index meta_deck_cards_deck_idx
  on public.meta_deck_cards (deck_id, board, position);

create index meta_deck_cards_format_idx
  on public.meta_deck_cards (format);

-- ────────────────────────────────────────────────────────────────────
-- RLS — public read, service-role write (mirrors top_commanders).
-- ────────────────────────────────────────────────────────────────────
alter table public.meta_decks enable row level security;
alter table public.meta_deck_cards enable row level security;

create policy meta_decks_select_anon
  on public.meta_decks
  for select
  using (true);

create policy meta_deck_cards_select_anon
  on public.meta_deck_cards
  for select
  using (true);

-- ────────────────────────────────────────────────────────────────────
-- Logical replication publication so PowerSync streams these tables.
-- ────────────────────────────────────────────────────────────────────
alter publication powersync add table public.meta_decks;
alter publication powersync add table public.meta_deck_cards;

-- ────────────────────────────────────────────────────────────────────
-- admin_replace_meta_deck(format, slug, name, colors, archetype_url,
--   meta_share, position, cards jsonb)
--
-- Atomic upsert+replace for one archetype. Each run of the worker
-- calls it once per archetype:
--
--   1. Upsert the meta_decks row (matched by (format, slug)). The
--      returning UUID is captured for the cards block.
--   2. DELETE every meta_deck_cards row for that deck.
--   3. INSERT all rows from the supplied jsonb array.
--
-- The whole thing happens inside a single SQL function, so observers
-- never see a half-written deck.
--
-- The `cards` argument is a JSONB array of objects, each shaped:
--   {
--     "scryfall_id": "uuid",
--     "quantity":    smallint,
--     "board":       "main" | "side",
--     "category":    "creatures" | ... | "sideboard",
--     "position":    smallint
--   }
-- ────────────────────────────────────────────────────────────────────
create or replace function public.admin_replace_meta_deck(
  p_format text,
  p_slug text,
  p_name text,
  p_colors text,
  p_archetype_url text,
  p_meta_share numeric,
  p_position smallint,
  p_cards jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deck_id uuid;
  v_now timestamptz := now();
begin
  -- Upsert the parent row — `id` stays stable across runs because
  -- the unique key is (format, slug).
  insert into public.meta_decks (
    format, slug, name, colors, archetype_url,
    meta_share, position, refreshed_at
  )
  values (
    p_format, p_slug, p_name, p_colors, p_archetype_url,
    p_meta_share, p_position, v_now
  )
  on conflict (format, slug) do update set
    name          = excluded.name,
    colors        = excluded.colors,
    archetype_url = excluded.archetype_url,
    meta_share    = excluded.meta_share,
    position      = excluded.position,
    refreshed_at  = excluded.refreshed_at
  returning id into v_deck_id;

  -- Replace cards atomically. Cascade is fine but explicit is
  -- cheaper than waiting on the FK action.
  delete from public.meta_deck_cards where deck_id = v_deck_id;

  if jsonb_array_length(coalesce(p_cards, '[]'::jsonb)) > 0 then
    insert into public.meta_deck_cards (
      deck_id, format, scryfall_id, quantity, board, category, position, refreshed_at
    )
    select
      v_deck_id,
      p_format,
      (c->>'scryfall_id')::uuid,
      (c->>'quantity')::smallint,
      c->>'board',
      c->>'category',
      (c->>'position')::smallint,
      v_now
    from jsonb_array_elements(p_cards) c;
  end if;

  return v_deck_id;
end;
$$;

comment on function public.admin_replace_meta_deck is
  'Worker-only: atomically upsert one meta_decks row and replace its '
  'meta_deck_cards. Service-role only.';

-- Lock down: only the service role calls this.
revoke all on function public.admin_replace_meta_deck(
  text, text, text, text, text, numeric, smallint, jsonb
) from public;
revoke all on function public.admin_replace_meta_deck(
  text, text, text, text, text, numeric, smallint, jsonb
) from anon, authenticated;
grant execute on function public.admin_replace_meta_deck(
  text, text, text, text, text, numeric, smallint, jsonb
) to service_role;

-- ────────────────────────────────────────────────────────────────────
-- admin_sweep_meta_decks(format, threshold)
--
-- After a run finishes for a format, the worker calls this with the
-- run's start timestamp. Any archetype whose refreshed_at is older
-- than the threshold has fallen out of the current top-N and is
-- removed (cards cascade).
-- ────────────────────────────────────────────────────────────────────
create or replace function public.admin_sweep_meta_decks(
  p_format text,
  p_threshold timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.meta_decks
  where format = p_format
    and refreshed_at < p_threshold;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.admin_sweep_meta_decks(text, timestamptz) from public;
revoke all on function public.admin_sweep_meta_decks(text, timestamptz) from anon, authenticated;
grant execute on function public.admin_sweep_meta_decks(text, timestamptz) to service_role;
