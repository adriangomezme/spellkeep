-- ============================================================
-- SpellKeep - Catalog sync runs tracking
-- ============================================================
-- Tracks each execution of the external catalog-sync worker
-- (GitHub Action) that mirrors Scryfall bulk data into Supabase.
--
-- Used to:
--   - Monitor sync health (latest successful run, duration, errors)
--   - Produce daily deltas (query cards updated between two runs)
--   - Gate snapshot generation (skip if nothing changed)
-- ============================================================

create type catalog_sync_status as enum ('running', 'succeeded', 'failed');

create table catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status catalog_sync_status not null default 'running',
  scryfall_bulk_updated_at timestamptz,
  cards_inserted integer not null default 0,
  cards_updated integer not null default 0,
  sets_upserted integer not null default 0,
  delta_url text,
  snapshot_url text,
  error_message text
);

create index idx_catalog_sync_runs_started_at on catalog_sync_runs(started_at desc);
create index idx_catalog_sync_runs_status on catalog_sync_runs(status);

-- Only service_role writes, no RLS needed for authenticated reads
-- (workers use service_role; clients don't need to see runs).
alter table catalog_sync_runs enable row level security;
