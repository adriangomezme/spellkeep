-- Redefine "unique cards" as distinct (print × finish) variants.
--
-- Before: unique = count(*) over collection_cards rows → treated a row
-- with qty_normal=1 AND qty_foil=1 as a single unique card.
-- After: unique = sum of finishes that have qty > 0 → that same row now
-- counts as 2 uniques (normal + foil). Matches the user's definition:
-- "Unique cards are distinguished by their variations (normal/foil/
-- etchedFoil)".

create or replace function get_collection_stats(p_collection_id uuid)
returns table (
  total_cards int,
  unique_cards int,
  total_value numeric
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    coalesce(sum(cc.quantity_normal + cc.quantity_foil + cc.quantity_etched), 0)::int as total_cards,
    coalesce(sum(
      (case when cc.quantity_normal > 0 then 1 else 0 end)
      + (case when cc.quantity_foil   > 0 then 1 else 0 end)
      + (case when cc.quantity_etched > 0 then 1 else 0 end)
    ), 0)::int as unique_cards,
    coalesce(sum(
      coalesce(c.price_usd, 0) * cc.quantity_normal
      + coalesce(c.price_usd_foil, c.price_usd, 0) * cc.quantity_foil
      + coalesce(c.price_usd_foil, c.price_usd, 0) * cc.quantity_etched
    ), 0)::numeric as total_value
  from collections col
  join collection_cards cc on cc.collection_id = col.id
  left join cards c on c.id = cc.card_id
  where col.id = p_collection_id
    and col.user_id = auth.uid();
$$;

create or replace function get_user_collection_summaries(p_type text default null)
returns table (
  id uuid,
  name text,
  type text,
  folder_id uuid,
  color text,
  total_cards int,
  unique_cards int,
  total_value numeric
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    col.id,
    col.name,
    col.type,
    col.folder_id,
    col.color,
    coalesce(sum(cc.quantity_normal + cc.quantity_foil + cc.quantity_etched), 0)::int as total_cards,
    coalesce(sum(
      (case when cc.quantity_normal > 0 then 1 else 0 end)
      + (case when cc.quantity_foil   > 0 then 1 else 0 end)
      + (case when cc.quantity_etched > 0 then 1 else 0 end)
    ), 0)::int as unique_cards,
    coalesce(sum(
      coalesce(c.price_usd, 0) * cc.quantity_normal
      + coalesce(c.price_usd_foil, c.price_usd, 0) * cc.quantity_foil
      + coalesce(c.price_usd_foil, c.price_usd, 0) * cc.quantity_etched
    ), 0)::numeric as total_value
  from collections col
  left join collection_cards cc on cc.collection_id = col.id
  left join cards c on c.id = cc.card_id
  where col.user_id = auth.uid()
    and (p_type is null or col.type = p_type)
  group by col.id, col.name, col.type, col.folder_id, col.color
  order by col.type, col.name;
$$;

create or replace function get_owned_stats()
returns table (
  total_cards int,
  unique_cards int,
  total_value numeric
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    coalesce(sum(cc.quantity_normal + cc.quantity_foil + cc.quantity_etched), 0)::int as total_cards,
    coalesce(sum(
      (case when cc.quantity_normal > 0 then 1 else 0 end)
      + (case when cc.quantity_foil   > 0 then 1 else 0 end)
      + (case when cc.quantity_etched > 0 then 1 else 0 end)
    ), 0)::int as unique_cards,
    coalesce(sum(
      coalesce(c.price_usd, 0) * cc.quantity_normal
      + coalesce(c.price_usd_foil, c.price_usd, 0) * cc.quantity_foil
      + coalesce(c.price_usd_foil, c.price_usd, 0) * cc.quantity_etched
    ), 0)::numeric as total_value
  from collections col
  join collection_cards cc on cc.collection_id = col.id
  left join cards c on c.id = cc.card_id
  where col.user_id = auth.uid()
    and col.type = 'binder';
$$;
