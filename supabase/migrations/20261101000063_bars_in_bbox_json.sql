-- The venue tile, as one JSON value instead of a row set.
--
-- PostgREST caps every response at the project's "max rows" setting (1000 on
-- this project) whatever the function's own limit says, and silently: the
-- client cannot tell a complete tile from a truncated one. A tile of central
-- Manhattan holds several thousand venues, so the app was being handed the
-- 1000 nearest the tile centre — everything past ~500 m of it, Pete's Tavern
-- included, was invisible. People then added a venue that was already in the
-- catalog, and the same truncated tile could not see that either, so the next
-- location fix read as having left and checked them straight back out.
--
-- A function returning a single jsonb value is one row, so nothing is capped
-- but the limit asked for, which the client can compare against what it got.

create function bars_in_bbox_json (
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  max_rows integer default 1000
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(venue)), '[]'::jsonb)
  from (
    select
      bars.id,
      bars.name,
      bars.street,
      bars.city,
      bars.state,
      bars.lat,
      bars.lng,
      bars.category
    from bars
    where st_intersects(
      bars.location,
      st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
    )
    order by bars.location <-> st_setsrid(
      st_makepoint((min_lng + max_lng) / 2, (min_lat + max_lat) / 2), 4326
    )::geography
    limit least(greatest(max_rows, 1), 5000)
  ) as venue;
$$;

revoke all on function bars_in_bbox_json (
  double precision, double precision, double precision, double precision, integer
) from public;

revoke all on function bars_in_bbox_json (
  double precision, double precision, double precision, double precision, integer
) from anon;

grant execute on function bars_in_bbox_json (
  double precision, double precision, double precision, double precision, integer
) to authenticated;
