-- Add user_id directly on collection_cards so the PowerSync stream can
-- filter by it without a JOIN. The previous stream query
-- `SELECT cc.* FROM collection_cards cc INNER JOIN collections c ON
--  cc.collection_id = c.id WHERE c.user_id = auth.user_id()`
-- gets rewritten by PowerSync edition 3 into a parameter subquery and
-- blows past the 1000-row cap (PSYNC_S2305), silently stalling the sync
-- of collection_cards for any user with >1k owned cards.

ALTER TABLE collection_cards ADD COLUMN IF NOT EXISTS user_id uuid;

-- Backfill existing rows from their owning collection.
UPDATE collection_cards cc
SET user_id = c.user_id
FROM collections c
WHERE cc.collection_id = c.id
  AND cc.user_id IS NULL;

-- Enforce the column going forward.
ALTER TABLE collection_cards ALTER COLUMN user_id SET NOT NULL;

-- Auto-populate on INSERT if the client omitted the column. Keeps the
-- client-side mutation API unchanged while making user_id authoritative
-- server-side.
CREATE OR REPLACE FUNCTION sp_set_collection_card_user_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT user_id INTO NEW.user_id FROM collections WHERE id = NEW.collection_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_collection_card_user_id ON collection_cards;
CREATE TRIGGER trg_set_collection_card_user_id
BEFORE INSERT ON collection_cards
FOR EACH ROW EXECUTE FUNCTION sp_set_collection_card_user_id();

-- Index the new sync filter so the stream query is fast.
CREATE INDEX IF NOT EXISTS idx_collection_cards_user_id ON collection_cards(user_id);

-- Foreign key so deleting a user / auth row cascades cleanly. Redundant
-- with the collection_id cascade but keeps the constraint graph obvious.
ALTER TABLE collection_cards
  ADD CONSTRAINT collection_cards_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
