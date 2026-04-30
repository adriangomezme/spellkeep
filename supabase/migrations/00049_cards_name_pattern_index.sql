-- Captures an index that was applied directly to production via the
-- Supabase MCP during a commander-sync incident: the resolver's
-- `name LIKE 'X // %'` pattern was hitting the 8 s statement timeout
-- because the existing `idx_cards_name` btree uses the default
-- collation, which doesn't satisfy LIKE 'prefix%' patterns. The
-- companion `text_pattern_ops` index makes those scans O(log n).
--
-- The current commander-sync resolver has since been simplified to a
-- direct `id IN (...)` lookup and no longer issues LIKE queries. The
-- index is retained because:
--   1. It already exists in production (this migration is a no-op
--      with `if not exists`, kept for environment parity).
--   2. Future LIKE-prefix lookups on `cards.name` (catalog search,
--      autocompletion) will benefit from it without another round-
--      trip change.

create index if not exists idx_cards_name_pattern
  on public.cards (name text_pattern_ops);
