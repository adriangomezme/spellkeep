-- ============================================================
-- SpellKeep — Price Alerts
-- ============================================================
-- Matches the columns of the local PowerSync `price_alerts` table. Up
-- until this migration the table was `localOnly: true`; with this SQL +
-- the new sync-streams entry it becomes user-scoped synced state.
--
-- Caps (enforced server-side so a malicious client can't bypass them):
--   * 10 alerts per (user_id, card_id) — total, any status.
--   * 250 active alerts per user_id.
-- ============================================================

create table price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,

  -- Denormalised card snapshot so the alert can render without joining
  -- the cards catalog. The client already fills these from the local
  -- catalog when the alert is created.
  card_id text not null,
  card_name text not null,
  card_set text not null,
  card_collector_number text not null,
  card_image_uri text,

  finish text not null check (finish in ('normal', 'foil', 'etched')),
  direction text not null check (direction in ('below', 'above')),
  mode text not null check (mode in ('price', 'percent')),
  target_value double precision not null check (target_value > 0),
  snapshot_price double precision not null check (snapshot_price >= 0),
  status text not null default 'active'
    check (status in ('active', 'triggered', 'paused')),

  created_at timestamptz not null default now(),
  triggered_at timestamptz,
  updated_at timestamptz not null default now()
);

create index idx_price_alerts_user on price_alerts(user_id);
create index idx_price_alerts_card on price_alerts(card_id);
-- Combined index drives both the 250-active cap check and the trigger
-- worker's "find alerts to evaluate" scan.
create index idx_price_alerts_user_status on price_alerts(user_id, status);

-- ============================================================
-- updated_at
-- ============================================================

create trigger trg_price_alerts_updated_at
  before update on price_alerts
  for each row execute function update_updated_at();

-- ============================================================
-- Caps (INSERT + UPDATE when status flips to 'active')
-- ============================================================

create or replace function enforce_price_alert_caps()
returns trigger as $$
declare
  per_card_total int;
  per_user_active int;
begin
  -- 10 per card (total, any status). Only checked on INSERT because the
  -- client never changes card_id on an existing alert.
  if TG_OP = 'INSERT' then
    select count(*) into per_card_total
      from price_alerts
      where user_id = NEW.user_id and card_id = NEW.card_id;
    if per_card_total >= 10 then
      raise exception 'max_alerts_per_card_exceeded'
        using errcode = 'check_violation',
              hint = 'At most 10 alerts per card.';
    end if;
  end if;

  -- 250 active per user. Checked on INSERT when status='active', and on
  -- UPDATE when status flips into 'active' from something else.
  if NEW.status = 'active' and (
       TG_OP = 'INSERT'
    or (TG_OP = 'UPDATE' and OLD.status is distinct from 'active')
  ) then
    select count(*) into per_user_active
      from price_alerts
      where user_id = NEW.user_id and status = 'active';
    if per_user_active >= 250 then
      raise exception 'max_active_alerts_per_user_exceeded'
        using errcode = 'check_violation',
              hint = 'At most 250 active alerts per user.';
    end if;
  end if;

  return NEW;
end;
$$ language plpgsql
   set search_path = public, pg_catalog;

create trigger trg_price_alerts_enforce_caps
  before insert or update on price_alerts
  for each row execute function enforce_price_alert_caps();

-- ============================================================
-- RLS
-- ============================================================

alter table price_alerts enable row level security;

create policy "Users manage their own price alerts"
  on price_alerts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
