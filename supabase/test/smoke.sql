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

-- Drink photos have the same audience as a status, minus the "only while at a
-- bar" rule: the owner and the friends they accepted, nobody else.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into drink_posts (user_id, bar_id, bar_name, beer_name, description, rating, image_path)
values (
  '11111111-1111-1111-1111-111111111111',
  '44444444-4444-4444-4444-444444444444',
  'The Long Pour', 'Cellar Pils', 'Crisp and cold.', 5,
  '11111111-1111-1111-1111-111111111111/1.jpg'
);
select count(*) = 1 as owner_sees_own_drinks
  from drink_posts_for('11111111-1111-1111-1111-111111111111');

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) = 1 as friend_sees_drinks
  from drink_posts_for('11111111-1111-1111-1111-111111111111');

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select count(*) = 0 as stranger_sees_no_drinks
  from drink_posts_for('11111111-1111-1111-1111-111111111111');
select count(*) = 0 as stranger_cannot_read_table from drink_posts;

do $$ begin
  insert into drink_posts (user_id, bar_name, beer_name, rating, image_path)
  values ('11111111-1111-1111-1111-111111111111', 'The Long Pour', 'Forgery', 1, 'forged.jpg');
  raise exception 'a stranger posted as someone else';
exception
  when insufficient_privilege then null;
end $$;
select true as stranger_cannot_post_as_someone_else;

do $$ begin
  insert into drink_posts (user_id, bar_name, beer_name, rating, image_path)
  values (
    '33333333-3333-3333-3333-333333333333', 'The Long Pour', 'Overrated', 6,
    '33333333-3333-3333-3333-333333333333/1.jpg'
  );
  raise exception 'a rating outside 1-5 was accepted';
exception
  when check_violation then null;
end $$;
select true as rating_must_be_one_to_five;

reset role;
-- Storage policies key off the <owner uuid>/<file> prefix of the object name.
select storage_object_owner('11111111-1111-1111-1111-111111111111/1.jpg')
    = '11111111-1111-1111-1111-111111111111'::uuid as storage_owner_from_path;
select storage_object_owner('not-a-uuid/1.jpg') is null as malformed_path_has_no_owner;

-- The anon key ships inside the app, so nothing beyond the sender's own
-- functions may be reachable with it.
select not bool_or(has_function_privilege('anon', p.oid, 'execute')) as anon_cannot_execute_rpcs
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('claim_push_batch', 'mark_push_sent', 'mark_push_failed',
      'drop_push_tokens', 'prune_notification_outbox', 'register_push_token',
      'unregister_push_token', 'set_current_bar', 'bars_in_bbox', 'invite_by_email',
      'respond_to_friend_request', 'accept_invite', 'friend_feed', 'drink_posts_for');

select not bool_or(has_function_privilege('authenticated', p.oid, 'execute')) as sender_rpcs_are_service_role_only
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('claim_push_batch', 'mark_push_sent', 'mark_push_failed',
      'drop_push_tokens', 'prune_notification_outbox');
