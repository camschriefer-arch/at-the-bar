-- Lets someone add the venue they are standing in when the catalog does not
-- have it.
--
-- Overture is the catalog and it is not complete: Buttermilk & Bourbon in
-- Watertown MA is in Overture with no category at all, so the importer — which
-- only takes bars, pubs and restaurants — skips it, and OpenStreetMap does not
-- carry the place either. Without a way in, those venues stay uncheckinable
-- forever.
--
-- A submitted venue is a catalog row like any other, keyed on a source of its
-- own so the monthly Overture refresh neither overwrites nor prunes it. Nothing
-- about who submitted it is stored: that would tie a person to a place, which
-- is the one thing this schema does not do.

alter table bars drop constraint bars_source_check;

alter table bars add constraint bars_source_check
  check (source in ('osm', 'overture', 'user'));

/**
 * Adds a venue at the caller's location and returns it, or returns the
 * matching venue when the catalog already has one.
 *
 * The duplicate check is deliberately narrow — same name within `MATCH_METERS`
 * — because a submission only happens after the picker showed the user nothing
 * they recognised, and two venues of the same name a block apart are two
 * venues.
 */
create function add_venue (
  p_name text,
  p_lat double precision,
  p_lng double precision,
  p_category text default 'bar'
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
    insert into bars (name, lat, lng, location, category, source, source_id)
    values (
      clean_name,
      p_lat,
      p_lng,
      point,
      p_category,
      'user',
      gen_random_uuid()::text
    )
    returning bars.id into created;
  end if;

  return query
  select bars.id, bars.name, bars.street, bars.city, bars.state, bars.lat, bars.lng, bars.category
  from bars
  where bars.id = coalesce(existing, created);
end;
$$;

revoke all on function add_venue (text, double precision, double precision, text)
  from public, anon, authenticated;

grant execute on function add_venue (text, double precision, double precision, text) to authenticated;
