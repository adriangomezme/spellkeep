-- Filtered totals mirror the active search + filter so the header
-- reflects what the user is looking at when narrowing the list.
create or replace function get_owned_cards_filtered_stats(
  p_search text default null,
  p_filters jsonb default '{}'::jsonb
)
returns table (total_cards int, unique_cards int, total_value numeric)
language sql security invoker stable set search_path = public
as $$
  with owned as (
    select cc.card_id, cc.condition, cc.language,
      sum(cc.quantity_normal)::int as qn,
      sum(cc.quantity_foil)::int as qf,
      sum(cc.quantity_etched)::int as qe
    from collection_cards cc
    join collections col on col.id = cc.collection_id
    where col.user_id = auth.uid() and col.type = 'binder'
    group by cc.card_id, cc.condition, cc.language
  ),
  enriched as (
    select o.qn, o.qf, o.qe,
      c.rarity, c.set_code, c.type_line, c.cmc, c.is_legendary,
      c.price_usd, c.price_usd_foil, c.color_identity, c.name,
      c.set_name, c.collector_number
    from owned o
    join cards c on c.id = o.card_id
  ),
  filtered as (
    select * from enriched e
    where
      (coalesce(p_search, '') = '' or (
        e.name ilike '%' || p_search || '%'
        or coalesce(e.set_name, '') ilike '%' || p_search || '%'
        or e.set_code ilike '%' || p_search || '%'
        or coalesce(e.type_line, '') ilike '%' || p_search || '%'
        or e.collector_number ilike '%' || p_search || '%'
      ))
      and (coalesce(jsonb_array_length(p_filters->'rarity'), 0) = 0
           or e.rarity = any (select jsonb_array_elements_text(p_filters->'rarity')))
      and (coalesce(jsonb_array_length(p_filters->'sets'), 0) = 0
           or e.set_code = any (select jsonb_array_elements_text(p_filters->'sets')))
      and (p_filters->>'isLegendary' is null or p_filters->>'isLegendary' = ''
           or (p_filters->>'isLegendary')::boolean = coalesce(e.is_legendary, false))
      and (coalesce(jsonb_array_length(p_filters->'types'), 0) = 0
           or exists (select 1 from jsonb_array_elements_text(p_filters->'types') t
                      where coalesce(e.type_line, '') ilike '%' || t || '%'))
      and (coalesce(jsonb_array_length(p_filters->'colors'), 0) = 0
           or (('C' = any (select jsonb_array_elements_text(p_filters->'colors'))
                and coalesce(array_length(e.color_identity, 1), 0) = 0)
               or exists (select 1 from jsonb_array_elements_text(p_filters->'colors') col
                          where col <> 'C' and col = any (e.color_identity))))
      and (coalesce(jsonb_array_length(p_filters->'manaValue'), 0) = 0
           or exists (select 1 from jsonb_array_elements_text(p_filters->'manaValue') mv
                      where (mv = '7+' and coalesce(e.cmc, 0) >= 7)
                         or (mv <> '7+' and coalesce(e.cmc, 0) = mv::numeric)))
      and (coalesce(p_filters->>'priceValue', '') = ''
           or (case when coalesce(p_filters->>'priceMode', 'gte') = 'gte'
                    then coalesce(e.price_usd, 0) >= (p_filters->>'priceValue')::numeric
                    else coalesce(e.price_usd, 0) <= (p_filters->>'priceValue')::numeric end))
  )
  select
    coalesce(sum(qn + qf + qe), 0)::int,
    coalesce(sum(
      (case when qn > 0 then 1 else 0 end)
      + (case when qf > 0 then 1 else 0 end)
      + (case when qe > 0 then 1 else 0 end)
    ), 0)::int,
    coalesce(sum(
      coalesce(price_usd, 0) * qn
      + coalesce(price_usd_foil, price_usd, 0) * qf
      + coalesce(price_usd_foil, price_usd, 0) * qe
    ), 0)::numeric
  from filtered;
$$;

-- All sets the user owns (across binders). Powers the filter sheet's
-- set picker when no filter is active so the list is complete.
create or replace function get_owned_available_sets()
returns table (code text, name text, count int)
language sql security invoker stable set search_path = public
as $$
  select c.set_code as code, max(c.set_name) as name, count(*)::int as count
  from collection_cards cc
  join collections col on col.id = cc.collection_id
  join cards c on c.id = cc.card_id
  where col.user_id = auth.uid() and col.type = 'binder'
  group by c.set_code
  order by max(c.set_name);
$$;

grant execute on function get_owned_cards_filtered_stats(text, jsonb) to authenticated;
grant execute on function get_owned_available_sets() to authenticated;
