-- Restaurants join the catalog.
--
-- OpenStreetMap tags plenty of drinking spots as `amenity=restaurant` (Jake &
-- Joe's in Waltham, MA is one), and the alcohol-related tags that could tell a
-- gastropub from a diner are set on well under 5% of them. So restaurants are
-- imported wholesale and separated by category instead: bars and pubs still
-- check you in automatically, restaurants only after you confirm the prompt.

alter table bars add column category text not null default 'bar';

alter table bars add constraint bars_category_check
  check (category in ('bar', 'pub', 'restaurant'));

create index bars_category_idx on bars (category);

-- Recreated rather than replaced: the return type gains `category`, and the
-- catalog is now large enough that a bounding box has to use the spatial index
-- and return the rows closest to the box first.
drop function if exists bars_in_bbox (
  double precision, double precision, double precision, double precision, integer
);

create function bars_in_bbox (
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  max_rows integer default 1000
) returns table (
  id uuid,
  name text,
  street text,
  city text,
  state text,
  lat double precision,
  lng double precision,
  category text
)
language sql
stable
security definer
set search_path = public
as $$
  select bars.id, bars.name, bars.street, bars.city, bars.state, bars.lat, bars.lng, bars.category
  from bars
  where st_intersects(
    bars.location,
    st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
  )
  order by bars.location <-> st_setsrid(
    st_makepoint((min_lng + max_lng) / 2, (min_lat + max_lat) / 2), 4326
  )::geography
  limit least(greatest(max_rows, 1), 5000);
$$;

revoke all on function bars_in_bbox (
  double precision, double precision, double precision, double precision, integer
) from public;

revoke all on function bars_in_bbox (
  double precision, double precision, double precision, double precision, integer
) from anon;

grant execute on function bars_in_bbox (
  double precision, double precision, double precision, double precision, integer
) to authenticated;
