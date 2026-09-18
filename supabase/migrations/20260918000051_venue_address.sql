-- A venue someone adds arrives with a street, city and state, geocoded from
-- the same fix that places it on the map. Before this the row carried only
-- coordinates, so a user-added venue showed a bare name where an imported one
-- shows "Waltham, MA".

drop function if exists add_venue (text, double precision, double precision, text);

create function add_venue (
  p_name text,
  p_lat double precision,
  p_lng double precision,
  p_category text default 'bar',
  p_street text default null,
  p_city text default null,
  p_state text default null
) returns table (
  id uuid,
  name text,
  street text,
  city text,
  state text,
  lat double precision,
  lng double precision,
  category text
) language plpgsql security definer
set search_path = public as $$
declare
  match_meters constant double precision := 120;
  clean_name text := btrim(p_name);
  clean_street text := nullif(left(btrim(coalesce(p_street, '')), 120), '');
  clean_city text := nullif(left(btrim(coalesce(p_city, '')), 80), '');
  clean_state text := nullif(left(btrim(coalesce(p_state, '')), 40), '');
  point geography;
  existing uuid;
  created uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to add a venue';
  end if;

  if length(clean_name) < 2 or length(clean_name) > 80 then
    raise exception 'A venue name is between 2 and 80 characters';
  end if;

  if p_lat is null or p_lat < -90 or p_lat > 90 or p_lng is null or p_lng < -180 or p_lng > 180 then
    raise exception 'That location is not on the map';
  end if;

  if p_category not in ('bar', 'pub', 'restaurant') then
    raise exception 'A venue is a bar, a pub or a restaurant';
  end if;

  point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  select bars.id into existing
  from bars
  where lower(bars.name) = lower(clean_name)
    and st_dwithin (bars.location, point, match_meters)
  order by bars.location <-> point
  limit 1;

  if existing is null then
    insert into bars (name, street, city, state, lat, lng, location, category, source, source_id)
    values (
      clean_name,
      clean_street,
      clean_city,
      clean_state,
      p_lat,
      p_lng,
      point,
      p_category,
      'user',
      gen_random_uuid()::text
    )
    returning bars.id into created;
  else
    -- An address the row is missing is worth filling in; one it already has is
    -- left alone, since the importer's is better than a phone's guess.
    update bars
    set
      street = coalesce(bars.street, clean_street),
      city = coalesce(bars.city, clean_city),
      state = coalesce(bars.state, clean_state)
    where bars.id = existing;
  end if;

  return query
  select bars.id, bars.name, bars.street, bars.city, bars.state, bars.lat, bars.lng, bars.category
  from bars
  where bars.id = coalesce(existing, created);
end;
$$;

revoke all on function add_venue (
  text, double precision, double precision, text, text, text, text
) from public, anon, authenticated;

grant execute on function add_venue (
  text, double precision, double precision, text, text, text, text
) to authenticated;
