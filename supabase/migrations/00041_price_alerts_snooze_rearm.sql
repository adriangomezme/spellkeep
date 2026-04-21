-- Phase 4: snooze + re-arm support on price_alerts.
--
-- snoozed_until: when NOT NULL and in the future, the worker skips the
--   alert during evaluation. Automatically cleared server-side once the
--   timestamp elapses (see enforce_price_alert_caps).
--
-- auto_rearm: opt-in per alert. When true, a crossed alert doesn't just
--   flip to 'triggered' and stop — the worker leaves a stub that re-arms
--   when the price crosses back in reverse by at least REARM_HYSTERESIS.
--   Default false (one-shot behavior preserved for existing alerts).

alter table price_alerts
  add column if not exists snoozed_until timestamptz,
  add column if not exists auto_rearm boolean not null default false;

-- The worker filters `snoozed_until IS NULL OR snoozed_until <= now()` at
-- query time. We don't add a partial index because `now()` isn't
-- IMMUTABLE, so Postgres rejects it in a predicate. The existing
-- `idx_price_alerts_user_status` covers the (user_id, status='active')
-- scan and is sufficient at expected row counts.
