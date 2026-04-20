-- Scryfall exposes each print's language as `lang` (e.g. 'en', 'ja',
-- 'es'). Without it in our `cards` table, adding a Japanese printing
-- from the UI ends up with language='en' on the new collection_cards
-- row — the print's scryfall_id is distinct but we have no way to
-- derive the language downstream.
--
-- NULLable on purpose: rows populated pre-backfill read as NULL and the
-- client defaults to 'en'. Once the worker runs with the new mapper
-- every row will carry its real language.

alter table cards add column if not exists lang text;

create index if not exists idx_cards_lang on cards (lang) where lang is not null;
