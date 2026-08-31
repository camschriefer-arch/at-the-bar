-- Exercises the friendship/status rules end to end. Run against a scratch
-- database that already has stub_auth.sql and the migrations applied:
--   psql -f supabase/test/stub_auth.sql -f migrations... -f supabase/test/smoke.sql
\set ON_ERROR_STOP on

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'grace@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@example.com');

insert into bars (id, osm_type, osm_id, name, city, state, lat, lng, location)
values (
  '44444444-4444-4444-4444-444444444444',
  'node', 1, 'The Long Pour', 'Austin', 'TX', 30.2672, -97.7431,
  st_setsrid(st_makepoint(-97.7431, 30.2672), 4326)::geography
);

-- Ada invites Grace, Grace accepts.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select invite_by_email('grace@example.com') ->> 'status' as should_be_pending;

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select respond_to_friend_request(
  (select id from friendships where requester_id = '11111111-1111-1111-1111-111111111111'),
  true
) is not null as accepted;

-- Ada checks in at a bar.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select (set_current_bar('44444444-4444-4444-4444-444444444444')).bar_id is not null as checked_in;

-- Grace sees Ada at the bar; the stranger sees nothing.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) = 1 as friend_sees_status from user_status
  where user_id = '11111111-1111-1111-1111-111111111111';
select bar_name = 'The Long Pour' as friend_feed_shows_bar from friend_feed();

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select count(*) = 0 as stranger_sees_nothing from user_status
  where user_id = '11111111-1111-1111-1111-111111111111';
select count(*) = 0 as stranger_feed_empty from friend_feed();

-- Ada leaves: her row becomes invisible to Grace too.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select (set_current_bar(null)).bar_id is null as checked_out;

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) = 0 as friend_sees_nothing_when_home from user_status
  where user_id = '11111111-1111-1111-1111-111111111111';
select bar_id is null as feed_row_has_no_bar from friend_feed();

-- Grace was queued one arrival and one departure notice, naming Ada but not
-- the bar. The stranger was queued nothing.
reset role;
select body = 'ada is at the bar' as arrival_body_names_person_only
  from notification_outbox
  where recipient_id = '22222222-2222-2222-2222-222222222222' and event = 'arrived';
select body = 'ada has left the bar' as departure_body_names_person_only
  from notification_outbox
  where recipient_id = '22222222-2222-2222-2222-222222222222' and event = 'left';
select count(*) = 0 as stranger_not_notified from notification_outbox
  where recipient_id = '33333333-3333-3333-3333-333333333333';
