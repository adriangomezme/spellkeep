-- Owned view: merge + filter + sort + paginate server-side in a single
-- query. Client no longer pulls raw rows from every binder and fuses
-- in memory — that approach topped out at ~10k rows before it got
-- sluggish and flickery. Returns one row per (card_id, condition,
-- language) with quantities summed across binders, plus card fields
-- inlined so the client doesn't need a second join.
create or replace function get_owned_cards_merged(
  p_search text default null,
  p_sort text default 'added',
  p_ascending boolean default false,
  p_filters jsonb default '{}'::jsonb,
  p_limit int default 100,
  p_offset int default 0
)
returns table (
  card_id uuid,
  condition text,
  language text,
  quantity_normal int,
  quantity_foil int,
  quantity_etched int,
  added_at timestamptz,
  scryfall_id text,
  oracle_id text,
  name text,
  set_name text,
  set_code text,
  collector_number text,
  rarity text,
  type_line text,
  cmc numeric,
  is_legendary boolean,
  image_uri_small text,
  image_uri_normal text,
  price_usd numeric,
  price_usd_foil numeric,
  color_identity text[],
  layout text,
  artist text
)
language sql
security invoker
stable
set search_path = public
as $$
  with owned as (
    select
      cc.card_id,
      cc.condition,
      cc.language,
      sum(cc.quantity_normal)::int as qn,
      sum(cc.quantity_foil)::int as qf,
      sum(cc.quantity_etched)::int as qe,
      min(cc.added_at) as added_at
    from collection_cards cc
    join collections col on col.id = cc.collection_id
    where col.user_id = auth.uid()
      and col.type = 'binder'
    group by cc.card_id, cc.condition, cc.language
  ),
  enriched as (
    select
      o.card_id, o.condition, o.language,
      o.qn, o.qf, o.qe, o.added_at,
      c.scryfall_id, c.oracle_id, c.name, c.set_name, c.set_code,
      c.collector_number, c.rarity, c.type_line, c.cmc, c.is_legendary,
      c.image_uri_small, c.image_uri_normal,
      c.price_usd, c.price_usd_foil,
      c.color_identity, c.layout, c.artist
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
      and (
        p_filters->>'isLegendary' is null
        or p_filters->>'isLegendary' = ''
        or (p_filters->>'isLegendary')::boolean = coalesce(e.is_legendary, false)
      )
      and (coalesce(jsonb_array_length(p_filters->'types'), 0) = 0
           or exists (
             select 1 from jsonb_array_elements_text(p_filters->'types') t
             where coalesce(e.type_line, '') ilike '%' || t || '%'
           ))
      and (coalesce(jsonb_array_length(p_filters->'colors'), 0) = 0
           or (
             ('C' = any (select jsonb_array_elements_text(p_filters->'colors'))
              and coalesce(array_length(e.color_identity, 1), 0) = 0)
             or exists (
               select 1 from jsonb_array_elements_text(p_filters->'colors') col
               where col <> 'C' and col = any (e.color_identity)
             )
           ))
      and (coalesce(jsonb_array_length(p_filters->'manaValue'), 0) = 0
           or exists (
             select 1 from jsonb_array_elements_text(p_filters->'manaValue') mv
             where (mv = '7+' and coalesce(e.cmc, 0) >= 7)
                or (mv <> '7+' and coalesce(e.cmc, 0) = mv::numeric)
           ))
      and (
        coalesce(p_filters->>'priceValue', '') = ''
        or (
          case when coalesce(p_filters->>'priceMode', 'gte') = 'gte'
            then coalesce(e.price_usd, 0) >= (p_filters->>'priceValue')::numeric
            else coalesce(e.price_usd, 0) <= (p_filters->>'priceValue')::numeric
          end
        )
      )
  )
  select
    card_id, condition, language,
    qn as quantity_normal, qf as quantity_foil, qe as quantity_etched,
    added_at, scryfall_id, oracle_id, name, set_name, set_code,
    collector_number, rarity, type_line, cmc, is_legendary,
    image_uri_small, image_uri_normal,
    price_usd, price_usd_foil,
    color_identity, layout, artist
  from filtered
  order by
    case when p_sort = 'added' and not p_ascending then added_at end desc nulls last,
    case when p_sort = 'added' and p_ascending then added_at end asc nulls last,
    case when p_sort = 'name' and not p_ascending then name end desc,
    case when p_sort = 'name' and p_ascending then name end asc,
    case when p_sort = 'mana_value' and not p_ascending then coalesce(cmc, 0) end desc,
    case when p_sort = 'mana_value' and p_ascending then coalesce(cmc, 0) end asc,
    case when p_sort = 'price' and not p_ascending then coalesce(price_usd, 0) end desc,
    case when p_sort = 'price' and p_ascending then coalesce(price_usd, 0) end asc,
    case when p_sort = 'rarity' and not p_ascending then
      case rarity
        when 'common' then 0 when 'uncommon' then 1 when 'rare' then 2
        when 'mythic' then 3 when 'special' then 4 when 'bonus' then 5
        else 99 end end desc,
    case when p_sort = 'rarity' and p_ascending then
      case rarity
        when 'common' then 0 when 'uncommon' then 1 when 'rare' then 2
        when 'mythic' then 3 when 'special' then 4 when 'bonus' then 5
        else 99 end end asc,
    case when p_sort = 'set_code' and not p_ascending then set_code end desc,
    case when p_sort = 'set_code' and p_ascending then set_code end asc,
    case when p_sort = 'set_name' and not p_ascending then set_name end desc,
    case when p_sort = 'set_name' and p_ascending then set_name end asc,
    case when p_sort = 'collector_number' and not p_ascending then
      coalesce((substring(collector_number from '^[0-9]+'))::int, 0)
      end desc,
    case when p_sort = 'collector_number' and p_ascending then
      coalesce((substring(collector_number from '^[0-9]+'))::int, 0)
      end asc,
    card_id
  limit p_limit
  offset p_offset;
$$;

grant execute on function get_owned_cards_merged(text, text, boolean, jsonb, int, int) to authenticated;
