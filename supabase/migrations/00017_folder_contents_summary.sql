-- Stats for binders/lists inside a specific folder. Mirrors the
-- get_user_collection_summaries aggregation logic so counts match the
-- rest of the app (unique = distinct print × finish, not row count).
-- Replaces the nested-select-and-sum-in-JS approach that truncated
-- child rows at 1000 for large collections.
create or replace function get_folder_contents_summary(p_folder_id uuid)
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
    and col.folder_id = p_folder_id
  group by col.id, col.name, col.type, col.folder_id, col.color
  order by col.type, col.name;
$$;

grant execute on function get_folder_contents_summary(uuid) to authenticated;
