-- Stats RPCs. PostgREST's max_rows default is 1000, so anything computed in
-- the client by iterating collection_cards rows gets silently truncated on
-- collections past 1k entries. These functions aggregate server-side so the
-- answer is right regardless of collection size.

-- Per-collection stats: total cards (sum of quantities), unique entries
-- (row count), and total value (USD sum across finishes).
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
    count(*)::int as unique_cards,
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

-- Bulk summaries for the hub screen. One row per user collection with
-- aggregated stats. Replaces the previous nested-select-and-sum-in-JS
-- approach that was truncating at 1000 child rows per parent.
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
    count(cc.*)::int as unique_cards,
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

-- Owned stats (aggregate across all binders only). Used by the Collection
-- hub header.
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
    count(*)::int as unique_cards,
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

grant execute on function get_collection_stats(uuid) to authenticated;
grant execute on function get_user_collection_summaries(text) to authenticated;
grant execute on function get_owned_stats() to authenticated;
