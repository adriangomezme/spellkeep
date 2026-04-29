-- Top Commanders feed sourced from EDHREC.
--
-- The `commander-sync` worker scrapes EDHREC's `.json` endpoints
-- (commanders/week, commanders/month, commanders) every 5 days and
-- upserts the top 100 single-card commanders per window into this
-- table. The Search hub's "Top Commanders" carousel reads it via
-- PowerSync and renders the first 30 entries per window.
--
-- Partner pairs and any name that fails to resolve to a Scryfall ID
-- are skipped at the worker — every row here is guaranteed to point
-- at a real catalog card.
--
-- Column note: the time-bucket column is named `time_window` (not
-- `window`) because PowerSync's sync-streams SQL parser treats
-- `window` as a reserved keyword and rejects the SELECT.

-- Note: PowerSync edition-3 buckets every synced table by a single
-- `id` column. A composite PK collapses every row to the same
-- internal id on the client and only one survives. We use a UUID
-- `id` as the PK and enforce the (time_window, rank) invariant via
-- a unique constraint instead.
create table public.top_commanders (
  id uuid primary key default gen_random_uuid(),
  time_window text not null check (time_window in ('week', 'month', 'two-years')),
  rank smallint not null check (rank between 1 and 100),
  scryfall_id uuid not null,
  edhrec_slug text,
  refreshed_at timestamptz not null default now(),
  unique (time_window, rank)
);

comment on table public.top_commanders is
  'Top single-card commanders per EDHREC window (week / month / two-years). '
  'Refreshed every 5 days by the commander-sync worker. Streamed globally '
  'to all signed-in clients via PowerSync.';

comment on column public.top_commanders.time_window is
  'EDHREC time window: week | month | two-years (the all-time root list).';
comment on column public.top_commanders.rank is
  'Position in the EDHREC ranking (1 = most popular).';
comment on column public.top_commanders.scryfall_id is
  'Resolved canonical Scryfall ID. The catalog row is the source of '
  'truth for image/name/price; this table only carries the rank.';
comment on column public.top_commanders.edhrec_slug is
  'EDHREC URL slug for the commander, kept for back-reference and as a '
  'fallback signal during re-runs when name resolution drifts.';

-- Hot path: read by window ordered by rank.
create index top_commanders_window_rank_idx
  on public.top_commanders (time_window, rank);

-- PowerSync needs the table on the logical replication publication so
-- row changes stream to clients. The table is global (not per-user).
alter publication powersync add table public.top_commanders;
