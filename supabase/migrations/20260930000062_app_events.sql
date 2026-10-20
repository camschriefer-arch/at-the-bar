-- What people actually do with the app, as opposed to what they leave behind.
--
-- Everything measured until now has been a side effect of a feature: a row in
-- check_ins because someone checked in, a drink_posts row because they posted.
-- That answers "did it happen" and nothing else. It cannot say how often the
-- app asks and is told no, how long someone had been sitting there before it
-- asked, or whether anybody presses the buttons on a notification — which are
-- the questions behind every dwell and radius decision made so far.
--
-- One narrow table, written by the app and read by nobody in it.
--
-- What is deliberately NOT here: coordinates. An event can say the user was
-- 60 metres from a named venue at the moment they were asked about it, which
-- is the whole point of asking, but there is no row anywhere from which a
-- movement history could be reassembled. Distance is rounded to 10 m so it
-- cannot be trilaterated back into a position either.

create table if not exists app_events (
  id bigserial primary key,
  user_id uuid not null default auth.uid () references profiles (id) on delete cascade,
  at timestamptz not null default now(),
  event text not null check (
    event in (
      -- The app asked whether the user is at a venue.
      'prompt_shown',
      -- They said they were not.
      'prompt_declined',
      -- They checked in. `source` says what they tapped to do it.
      'check_in',
      -- A check-in they asked for by hand found nothing to check into.
      'check_in_found_nothing',
      -- A notification was opened or one of its buttons was pressed.
      'notification_opened'
    )
  ),
  bar_id uuid references bars (id) on delete set null,
  /**
   * Which path through the app the event came from: 'auto' or 'manual' for a
   * prompt, 'notification', 'picker', 'added' or 'join' for a check-in, and
   * the push event's own name for a notification. Left as text rather than an
   * enum so a new button is a line of client code, not a migration.
   */
  source text,
  /** How many venues the user was asked to choose between. */
  venue_count smallint,
  /** How long the venue had been in range when the app asked. */
  dwell_seconds integer,
  /** How far from the venue, rounded to 10 m. */
  distance_meters integer,
  /** How long the user took to answer the prompt. */
  answer_seconds integer
);

create index if not exists app_events_at_idx on app_events (at desc);
create index if not exists app_events_event_at_idx on app_events (event, at desc);
create index if not exists app_events_bar_idx on app_events (bar_id) where bar_id is not null;

alter table app_events enable row level security;

-- Write-only to the people it is about: an app that could read these back
-- would be a way to ask where a friend has been standing, and nothing in the
-- product needs them. The numbers are read with the service key, from
-- supabase/metrics.sql.
drop policy if exists "log own events" on app_events;

create policy "log own events" on app_events for insert
with
  check (user_id = auth.uid ());

-- The client says what happened, never who it happened to or when: both are
-- taken from the connection and the clock instead, so a tampered-with client
-- cannot date an event into a window it was not in or file it under someone
-- else. Column privileges are only checked for columns an insert names, so
-- omitting them still picks up auth.uid() and now().
revoke insert on table app_events from authenticated;

grant insert (
  event,
  bar_id,
  source,
  venue_count,
  dwell_seconds,
  distance_meters,
  answer_seconds
) on table app_events to authenticated;

/**
 * Drops events past the retention window. Behaviour questions are answered in
 * weeks and the aggregates worth keeping are read long before this, so holding
 * a year of per-tap rows would only mean holding them.
 */
create or replace function prune_app_events () returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  with gone as (
    delete from app_events where at < now() - interval '180 days' returning id
  )
  select count(*) into removed from gone;

  return removed;
end;
$$;

revoke all on function prune_app_events () from public;

revoke all on function prune_app_events () from anon;

revoke all on function prune_app_events () from authenticated;

grant execute on function prune_app_events () to service_role;
