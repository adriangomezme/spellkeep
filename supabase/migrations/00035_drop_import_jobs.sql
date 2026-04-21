-- The `import_jobs` table was originally meant to track background
-- server-side imports, but the client-side pipeline (bulk catalog
-- resolve + bulkUpsertCollectionCardsLocal) absorbed all of that work.
-- Zero rows, zero readers, zero writers. Drop the table + indexes +
-- policies; the only FKs on it point OUT (to auth.users / collections),
-- so nothing else in the schema depends on it.

drop table if exists public.import_jobs cascade;
