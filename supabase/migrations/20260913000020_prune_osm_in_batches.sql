-- Deleting a quarter of a million rows in one statement runs past Supabase's
-- statement timeout, so the caller now drives the delete a batch at a time.
drop function prune_unused_osm_bars ();

/**
 * Drops up to batch_size of the OSM rows Overture has replaced, keeping any a
 * user is standing in, has checked into, or has photographed a drink at —
 * deleting those would take their history with them. Returns how many went, so
 * the caller can keep calling until it returns zero.
 */
create function prune_unused_osm_bars (batch_size integer default 2000) returns integer language plpgsql security definer
set
  search_path = public as $$
declare
  removed integer;
begin
  with doomed as (
    select id from bars
    where source = 'osm'
      and not exists (select 1 from check_ins where check_ins.bar_id = bars.id)
      and not exists (select 1 from user_status where user_status.bar_id = bars.id)
      and not exists (select 1 from drink_posts where drink_posts.bar_id = bars.id)
    limit batch_size
  ), deleted as (
    delete from bars using doomed where bars.id = doomed.id returning 1
  )
  select count(*) into removed from deleted;

  return removed;
end;
$$;

revoke all on function prune_unused_osm_bars (integer) from public;

revoke all on function prune_unused_osm_bars (integer) from anon;

revoke all on function prune_unused_osm_bars (integer) from authenticated;

grant
execute on function prune_unused_osm_bars (integer) to service_role;
