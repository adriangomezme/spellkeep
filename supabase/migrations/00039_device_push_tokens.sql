-- ============================================================
-- Device push tokens
-- ============================================================
-- One row per (user, device). The client upserts on login + app-open,
-- and the catalog-sync worker reads these with the service-role key
-- when fanning out push notifications for triggered alerts.
--
-- Tokens are unique regardless of user so that if the same device gets
-- handed off between accounts we don't double-send.
-- ============================================================

create table device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index idx_device_push_tokens_user on device_push_tokens(user_id);

alter table device_push_tokens enable row level security;

-- Users manage only their own tokens. The service role (worker) reads
-- with bypassrls, so it doesn't need its own policy.
create policy "Users manage their own push tokens"
  on device_push_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
