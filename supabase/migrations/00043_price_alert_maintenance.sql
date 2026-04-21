-- Maintenance RPC invoked by the catalog-sync worker at the end of each
-- sweep. Does two things:
--
-- 1. Clears `snoozed_until` on alerts whose snooze window has elapsed.
--    The worker's eval filter already treats expired snoozes as eligible,
--    so this is cosmetic — keeps the column from collecting stale past
--    timestamps that the UI would otherwise ignore.
--
-- 2. Trims `price_alert_events` by keeping either the last 100 events
--    per alert OR anything within the last 90 days (union-preservation).
--    An event is deleted only if it fails BOTH — it's beyond the 100th
--    most-recent for its alert AND older than 90 days.

create or replace function sp_run_price_alert_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  cleared_snoozes int;
  deleted_events int;
begin
  update price_alerts
     set snoozed_until = null
   where snoozed_until is not null and snoozed_until <= now();
  get diagnostics cleared_snoozes = row_count;

  with ranked as (
    select id, alert_id, at,
           row_number() over (partition by alert_id order by at desc) as rn
    from price_alert_events
  )
  delete from price_alert_events
  where id in (
    select id from ranked
    where rn > 100 and at < now() - interval '90 days'
  );
  get diagnostics deleted_events = row_count;

  return jsonb_build_object(
    'cleared_snoozes', cleared_snoozes,
    'deleted_events', deleted_events
  );
end;
$$;
