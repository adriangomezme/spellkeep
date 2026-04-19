-- ============================================================
-- SpellKeep - flavor_text on cards
-- ============================================================
-- Scryfall exposes flavor_text at the top level for single-face cards
-- and per-face for DFCs. The UI renders it italic/styled under oracle
-- text — omitting it degrades the card detail experience.
--
-- Populated by the catalog-sync worker on its next run; existing rows
-- stay NULL until then, and the client detail fetch silently skips
-- the field when null.
-- ============================================================

alter table cards
  add column flavor_text text;
