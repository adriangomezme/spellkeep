-- ============================================================
-- Security fixes
-- ============================================================

-- CRITICAL: Remove open INSERT policy on cards table.
-- Card inserts are now handled by the ensure-card Edge Function
-- using service_role (bypasses RLS).
DROP POLICY IF EXISTS "Authenticated users can insert cards" ON cards;

-- CRITICAL: Remove overly permissive share_token policies.
-- These allowed ANY user to see ALL shared collections/decks.
-- Sharing will be re-implemented with proper token validation.
DROP POLICY IF EXISTS "Users can view shared collections via token" ON collections;
DROP POLICY IF EXISTS "Users can view shared decks via token" ON decks;

-- LOW: Move security definer functions to a private schema
-- For now, we keep them in public but this is noted for future refactor.
-- The functions handle_new_user and handle_new_profile are triggers
-- that fire on auth.users and profiles inserts respectively.
-- They are safe because they only INSERT into tables the new user owns.
