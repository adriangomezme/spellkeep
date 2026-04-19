-- Lists the per-binder rows that contribute to one Owned entry so the
-- user can pick which binder to edit when the aggregated row spans
-- multiple binders.
create or replace function get_owned_card_locations(
  p_card_id uuid,
  p_condition text,
  p_language text default 'en'
)
returns table (
  id uuid,
  collection_id uuid,
  collection_name text,
  quantity_normal int,
  quantity_foil int,
  quantity_etched int
)
language sql security invoker stable set search_path = public
as $$
  select cc.id, cc.collection_id, col.name as collection_name,
         cc.quantity_normal, cc.quantity_foil, cc.quantity_etched
  from collection_cards cc
  join collections col on col.id = cc.collection_id
  where col.user_id = auth.uid()
    and col.type = 'binder'
    and cc.card_id = p_card_id
    and cc.condition = p_condition
    and cc.language = p_language
  order by col.name;
$$;

grant execute on function get_owned_card_locations(uuid, text, text) to authenticated;
