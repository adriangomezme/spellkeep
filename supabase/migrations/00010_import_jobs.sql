-- ============================================================
-- SpellKeep - Server-side import jobs
-- ============================================================
-- Tracks async import jobs that run server-side instead of
-- blocking the client. Enables imports of 100k+ cards without
-- keeping the app open, and resumable progress via realtime.
--
-- Lifecycle: queued -> running -> (completed | failed)
-- ============================================================

create type import_job_status as enum ('queued', 'running', 'completed', 'failed');
create type import_format as enum ('spellkeep', 'plain', 'csv', 'tcgplayer', 'cardsphere', 'deckbox');

create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null references collections(id) on delete cascade,
  status import_job_status not null default 'queued',
  format import_format not null,
  source_text text,
  total_rows integer not null default 0,
  processed_rows integer not null default 0,
  imported_rows integer not null default 0,
  failed_rows jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index idx_import_jobs_user on import_jobs(user_id, created_at desc);
create index idx_import_jobs_status on import_jobs(status) where status in ('queued', 'running');

alter table import_jobs enable row level security;

create policy "Users can view their own import jobs"
  on import_jobs for select
  using (auth.uid() = user_id);

create policy "Users can create their own import jobs"
  on import_jobs for insert
  with check (auth.uid() = user_id);

-- Updates only via service_role (worker) — no user-facing policy.
