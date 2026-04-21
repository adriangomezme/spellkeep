-- PowerSync requires tables to be part of the `powersync` logical
-- replication publication so that row-level changes can be streamed.
-- Without this, deploying a sync-streams.yaml that references the table
-- fails validation with:
--   "Table public.price_alerts is not part of publication 'powersync'"

alter publication powersync add table public.price_alerts;
