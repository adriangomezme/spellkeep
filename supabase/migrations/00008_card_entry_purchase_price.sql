-- ============================================================
-- SpellKeep - Per-entry purchase price
-- ============================================================
-- Adds `purchase_price` to collection_cards so a user can record
-- how much they paid for a specific stack of copies. Treated as
-- last-write-wins on merges to keep the model simple.
-- ============================================================

alter table collection_cards
  add column purchase_price numeric;
