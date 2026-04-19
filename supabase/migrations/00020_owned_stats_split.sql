-- Split owned stats so the header can paint cards/unique totals
-- instantly even when the value aggregation trips statement_timeout.
-- The quantities query doesn't need the cards join; the value query
-- is the slow one because it joins collection_cards to cards.

create or replace function get_owned_stats_quantities()
returns table (total_cards int, unique_cards int)
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
    ), 0)::int as unique_cards
  from collections col
  join collection_cards cc on cc.collection_id = col.id
  where col.user_id = auth.uid()
    and col.type = 'binder';
$$;

create or replace function get_owned_stats_value()
returns table (total_value numeric)
language sql
security invoker
stable
set search_path = public
as $$
  select
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

grant execute on function get_owned_stats_quantities() to authenticated;
grant execute on function get_owned_stats_value() to authenticated;
