-- Drop server-side RPCs that no client, worker, or edge function still
-- calls. The N+1 / N+2 / N+3 local-first rewrite replaced every reader
-- with local SQLite queries (useQuery / hub cache) and every bulk
-- mutation with a client-side writeTransaction uploaded by PowerSync.
--
-- The three RPCs still in use (sp_delete_collection,
-- sp_delete_folder_with_contents, sp_empty_collection) remain defined
-- via their original migrations.

drop function if exists sp_bulk_upsert_collection_cards(uuid, jsonb);
drop function if exists sp_duplicate_collection(uuid, text);
drop function if exists sp_merge_collections(uuid, uuid);

drop function if exists get_collection_stats(uuid);
drop function if exists get_collection_stats_quantities(uuid);
drop function if exists get_collection_stats_value(uuid);
drop function if exists get_folder_contents_summary(uuid);
drop function if exists get_owned_available_sets();
drop function if exists get_owned_cards_filtered_stats(text, jsonb);
drop function if exists get_owned_cards_merged(text, text, boolean, jsonb, int, int);
drop function if exists get_owned_stats();
drop function if exists get_owned_stats_quantities();
drop function if exists get_owned_stats_value();
drop function if exists get_user_collection_summaries(text);
