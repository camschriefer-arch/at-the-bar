-- Numbers worth watching once the app is live.
--
-- Paste a block into the Supabase SQL editor (Project -> SQL editor) and run it;
-- each one stands alone. They only read, so they are safe to run against
-- production. "Last 30 days" is used throughout, and can be widened by changing
-- the interval.
--
-- Everything here counts rows the app already writes. It is not analytics in the
-- product sense: nothing tells you what someone tapped, only what they did.

-- ---------------------------------------------------------------------------
-- 1. How many people are here, and how many are still coming back
-- ---------------------------------------------------------------------------

-- Signups per day, and the running total.
select
  created_at::date as day,
  count(*) as signups,
  sum(count(*)) over (order by created_at::date) as users_total
from profiles
where created_at >= now() - interval '30 days'
group by day
order by day desc;

-- Daily and monthly actives, where "active" means the person did something
-- another user could see: arrived somewhere, posted, commented, reacted or
-- reshared. Opening the app is deliberately not counted, because the app does
-- not report it.
with activity as (
  select user_id, arrived_at as at from check_ins
  union all
  select user_id, created_at from drink_posts
  union all
  select author_id, created_at from drink_post_comments
  union all
  select user_id, created_at from drink_post_reactions
  union all
  select author_id, created_at from visit_comments
  union all
  select user_id, created_at from visit_reactions
  union all
  select user_id, created_at from post_reshares
),
days as (
  select generate_series(current_date - 29, current_date, interval '1 day')::date as day
)
select
  d.day,
  count(distinct a.user_id) filter (where a.at::date = d.day) as daily_active,
  count(distinct a.user_id) as active_last_30_days
from days d
left join activity a
  on a.at >= d.day - interval '29 days'
 and a.at < d.day + interval '1 day'
group by d.day
order by d.day desc;

-- Weekly retention by signup cohort: of the people who joined in a given week,
-- how many were still doing something one, two and three weeks later.
with activity as (
  select user_id, arrived_at as at from check_ins
  union all
  select user_id, created_at from drink_posts
  union all
  select author_id, created_at from drink_post_comments
  union all
  select user_id, created_at from drink_post_reactions
  union all
  select author_id, created_at from visit_comments
  union all
  select user_id, created_at from visit_reactions
  union all
  select user_id, created_at from post_reshares
),
cohorts as (
  select id as user_id, date_trunc('week', created_at) as cohort from profiles
),
weeks as (
  select
    c.cohort,
    c.user_id,
    floor(
      extract(epoch from date_trunc('week', a.at) - c.cohort) / 604800
    )::int as week_offset
  from cohorts c
  join activity a on a.user_id = c.user_id
)
select
  cohort::date as joined_week,
  count(distinct user_id) filter (where week_offset = 0) as week_0,
  count(distinct user_id) filter (where week_offset = 1) as week_1,
  count(distinct user_id) filter (where week_offset = 2) as week_2,
  count(distinct user_id) filter (where week_offset = 3) as week_3
from weeks
group by cohort
order by cohort desc;

-- ---------------------------------------------------------------------------
-- 2. Is the core loop happening: checking in, and posting a drink
-- ---------------------------------------------------------------------------

-- Check-ins per day, how many people they came from, and how long a visit ran.
-- An open visit is excluded from the duration, not counted as zero.
select
  arrived_at::date as day,
  count(*) as check_ins,
  count(distinct user_id) as people,
  round(
    (
      percentile_cont(0.5) within group (
        order by extract(epoch from departed_at - arrived_at) / 60
      )
    )::numeric,
    1
  ) as median_minutes
from check_ins
where arrived_at >= now() - interval '30 days'
group by day
order by day desc;

-- Photos per day, and the share of them tied to a venue.
select
  created_at::date as day,
  count(*) as posts,
  count(distinct user_id) as posters,
  count(*) filter (where bar_id is not null) as with_venue
from drink_posts
where created_at >= now() - interval '30 days'
group by day
order by day desc;

-- The venues people actually go to.
select
  b.name,
  coalesce(b.city, '-') as city,
  b.source,
  count(*) as check_ins,
  count(distinct c.user_id) as people,
  max(c.arrived_at) as last_seen
from check_ins c
join bars b on b.id = c.bar_id
where c.arrived_at >= now() - interval '30 days'
group by b.id, b.name, b.city, b.source
order by check_ins desc
limit 25;

-- Venues submitted through "Add a place", newest first. Worth a look now and
-- then: nothing moderates these.
select id, name, city, state, updated_at as added_at
from bars
where source = 'user'
order by updated_at desc
limit 50;

-- ---------------------------------------------------------------------------
-- 3. Does anyone respond to what gets posted
-- ---------------------------------------------------------------------------

-- Interactions per day, split by what they landed on.
select
  day,
  sum(n) filter (where kind = 'photo comment') as photo_comments,
  sum(n) filter (where kind = 'photo reaction') as photo_reactions,
  sum(n) filter (where kind = 'visit comment') as visit_comments,
  sum(n) filter (where kind = 'visit reaction') as visit_reactions,
  sum(n) filter (where kind = 'reshare') as reshares
from (
  select created_at::date as day, 'photo comment' as kind, count(*) as n
    from drink_post_comments where created_at >= now() - interval '30 days' group by 1
  union all
  select created_at::date, 'photo reaction', count(*)
    from drink_post_reactions where created_at >= now() - interval '30 days' group by 1
  union all
  select created_at::date, 'visit comment', count(*)
    from visit_comments where created_at >= now() - interval '30 days' group by 1
  union all
  select created_at::date, 'visit reaction', count(*)
    from visit_reactions where created_at >= now() - interval '30 days' group by 1
  union all
  select created_at::date, 'reshare', count(*)
    from post_reshares where created_at >= now() - interval '30 days' group by 1
) parts
group by day
order by day desc;

-- What share of photos got any response at all. A wall nobody answers is the
-- first thing to notice.
select
  count(*) as posts,
  count(*) filter (
    where exists (select 1 from drink_post_comments c where c.post_id = p.id)
       or exists (select 1 from drink_post_reactions r where r.post_id = p.id)
  ) as posts_with_a_response,
  round(
    100.0 * count(*) filter (
      where exists (select 1 from drink_post_comments c where c.post_id = p.id)
         or exists (select 1 from drink_post_reactions r where r.post_id = p.id)
    ) / nullif(count(*), 0),
    1
  ) as percent
from drink_posts p
where created_at >= now() - interval '30 days';

-- ---------------------------------------------------------------------------
-- 4. Is the app spreading, and can it reach people
-- ---------------------------------------------------------------------------

-- Invite funnel. An invite is a link or an email that has no account behind it
-- yet; "expired" means nobody opened it within 30 days.
select
  count(*) as invites_sent,
  count(*) filter (where status = 'accepted') as accepted,
  count(*) filter (where status = 'pending' and expires_at > now()) as still_open,
  count(*) filter (where status = 'pending' and expires_at <= now()) as expired,
  round(100.0 * count(*) filter (where status = 'accepted') / nullif(count(*), 0), 1)
    as percent_accepted
from invites
where created_at >= now() - interval '30 days';

-- Friend requests between people who both already have accounts.
select
  count(*) as requests,
  count(*) filter (where status = 'accepted') as accepted,
  count(*) filter (where status = 'pending') as pending,
  round(100.0 * count(*) filter (where status = 'accepted') / nullif(count(*), 0), 1)
    as percent_accepted
from friendships
where created_at >= now() - interval '30 days';

-- How connected people are. Someone with no friends sees an empty feed, which
-- is the likeliest reason to leave.
with accepted as (
  select requester_id as user_id from friendships where status = 'accepted'
  union all
  select addressee_id from friendships where status = 'accepted'
)
select
  count(*) as users,
  count(*) filter (where friends = 0) as with_no_friends,
  round(avg(friends)::numeric, 1) as average_friends,
  max(friends) as most_friends
from (
  select p.id, count(a.user_id) as friends
  from profiles p
  left join accepted a on a.user_id = p.id
  group by p.id
) per_user;

-- Can we actually notify people: a user with no push token gets nothing, and a
-- stale token is why a friend "never hears" about anything.
select
  count(*) as users,
  count(*) filter (where t.user_id is not null) as with_push_token,
  count(*) filter (where t.user_id is null) as without_push_token
from profiles p
left join (select distinct user_id from push_tokens) t on t.user_id = p.id;

-- Anything stuck in the outbox. This should be empty or near it; a backlog means
-- send-push or the email function is failing.
select
  'push' as queue,
  count(*) filter (where sent_at is null) as unsent,
  min(created_at) filter (where sent_at is null) as oldest_unsent
from notification_outbox
union all
select
  'email',
  count(*) filter (where sent_at is null),
  min(created_at) filter (where sent_at is null)
from email_outbox;

-- ---------------------------------------------------------------------------
-- 5. Moderation
-- ---------------------------------------------------------------------------

-- Reports waiting on a human. Nothing in the app surfaces these, so this query
-- is the only place they appear.
select
  r.created_at,
  r.reason,
  r.post_id,
  reporter.display_name as reported_by,
  owner.display_name as post_by
from post_reports r
join profiles reporter on reporter.id = r.reporter_id
left join drink_posts p on p.id = r.post_id
left join profiles owner on owner.id = p.user_id
order by r.created_at desc
limit 50;

-- Blocks, as a health signal rather than a list to act on.
select count(*) as blocks, count(distinct blocker_id) as people_blocking
from user_blocks;
