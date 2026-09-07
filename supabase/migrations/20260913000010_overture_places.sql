-- The catalog moves from OpenStreetMap to Overture Maps.
--
-- OSM simply does not have most of what people check into: a beta tester stood
-- in City Works in Watertown MA and the nearest venue OSM knows about was 165 m
-- away, with almost none of the surrounding development mapped at all. Overture
-- carries the same place with an address and a category.
--
-- Rows are therefore keyed on (source, source_id) rather than the OSM id.

alter table bars add column source text not null default 'osm';

alter table bars add constraint bars_source_check check (source in ('osm', 'overture'));

alter table bars add column source_id text;

update bars set source_id = osm_type || '/' || osm_id::text where source_id is null;

alter table bars alter column source_id set not null;

-- Overture places have no OSM identity, so the old key can no longer be required.
alter table bars alter column osm_type drop not null;

alter table bars alter column osm_id drop not null;

alter table bars add constraint bars_source_id_key unique (source, source_id);

/**
 * Drops the OSM rows that Overture has replaced, keeping any a user is standing
 * in, has checked into, or has photographed a drink at — deleting those would
 * take their history with them.
 */
create function prune_unused_osm_bars () returns integer language plpgsql security definer
set
  search_path = public as $$
declare
  removed integer;
begin
  with deleted as (
    delete from bars
    where source = 'osm'
      and not exists (select 1 from check_ins where check_ins.bar_id = bars.id)
      and not exists (select 1 from user_status where user_status.bar_id = bars.id)
      and not exists (select 1 from drink_posts where drink_posts.bar_id = bars.id)
    returning 1
  )
  select count(*) into removed from deleted;

  return removed;
end;
$$;

revoke all on function prune_unused_osm_bars () from public;

revoke all on function prune_unused_osm_bars () from anon;

revoke all on function prune_unused_osm_bars () from authenticated;

grant
execute on function prune_unused_osm_bars () to service_role;
