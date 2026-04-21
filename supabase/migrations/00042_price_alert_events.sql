-- Per-alert trigger history. Each time the worker flips an alert (one-shot
-- or auto-rearm), it appends a row here. Used by the edit sheet to show
-- "has triggered N times in 30d" and by a possible future chart.
--
-- Because this is user-scoped and small (capped by how often alerts fire),
-- we sync it down to the client with RLS + a PowerSync stream. Older
-- events are trimmed by a retention policy (see the cleanup step).

create table price_alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references price_alerts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  current_price double precision not null,
  target_price double precision not null,
  direction text not null,
  mode text not null,
  at timestamptz not null default now()
);

create index idx_price_alert_events_alert on price_alert_events(alert_id, at desc);
create index idx_price_alert_events_user on price_alert_events(user_id, at desc);

alter table price_alert_events enable row level security;

create policy "Users read their own alert events"
  on price_alert_events for select
  using (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies — only the service role (worker)
-- writes to this table. Clients only read.

alter publication powersync add table public.price_alert_events;