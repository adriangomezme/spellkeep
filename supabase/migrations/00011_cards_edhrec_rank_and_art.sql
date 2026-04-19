-- ============================================================
-- SpellKeep - edhrec_rank + illustration_id on cards
-- ============================================================
-- edhrec_rank: global popularity rank from EDHREC (lower = more played).
-- Used as the default sort in catalog search so the most-played cards
-- surface first, mirroring Scryfall's default.
--
-- illustration_id: stable ID per unique card art. Enables `unique=art`
-- style searches where the user wants one result per distinct
-- illustration, not per printing.
-- ============================================================

alter table cards
  add column edhrec_rank integer,
  add column illustration_id text;

create index idx_cards_edhrec_rank on cards(edhrec_rank)
  where edhrec_rank is not null;
