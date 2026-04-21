-- Persist the alert's snapshot price at the moment of each trigger.
-- Without this column, auto-rearm events appear to have a 0% delta in
-- the detail/history views — the worker re-anchors `snapshot_price`
-- on the alert row right after inserting the event, so reading
-- snapshot from the parent alert always equals current_price for
-- recent re-armed events.

alter table price_alert_events
  add column if not exists snapshot_price double precision;
