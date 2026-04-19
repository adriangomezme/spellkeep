-- ============================================================
-- Add type to collection_folders (binder folders vs list folders)
-- ============================================================

alter table collection_folders
  add column type text not null default 'binder'
  check (type in ('binder', 'list'));
