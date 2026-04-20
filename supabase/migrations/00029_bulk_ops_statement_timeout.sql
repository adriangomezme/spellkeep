-- The `authenticated` role has statement_timeout=8s globally. Bulk
-- duplicate/merge/import on 100k-row collections overshoot that and
-- fail with "canceling statement due to statement timeout" before the
-- INSERT can finish. Scope the relaxation to the three RPCs that legit
-- do heavy work.

alter function sp_duplicate_collection(uuid, text)
  set statement_timeout = '120s';

alter function sp_merge_collections(uuid, uuid)
  set statement_timeout = '120s';

alter function sp_bulk_upsert_collection_cards(uuid, jsonb)
  set statement_timeout = '120s';

alter function sp_delete_collection(uuid)
  set statement_timeout = '120s';

alter function sp_delete_folder_with_contents(uuid)
  set statement_timeout = '120s';

alter function sp_empty_collection(uuid)
  set statement_timeout = '120s';
