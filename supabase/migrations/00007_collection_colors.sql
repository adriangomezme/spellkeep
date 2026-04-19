-- ============================================================
-- Add color to collections and collection_folders
-- ============================================================

alter table collections add column color text;
alter table collection_folders add column color text;
