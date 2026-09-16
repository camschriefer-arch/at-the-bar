-- The feed: one stream of what the friends you accepted have been doing —
-- the photos they posted and the bars they checked in at, newest first.
--
-- Nothing here widens who can see what. The audience is the same accepted
-- friendship the rest of the app runs on; the feed only gathers into one place
-- what was already on profiles and in pushes. What is new is moderation, which
-- a wall of user content needs even among friends.

-- The feed reads newest-first across every friend, not one user at a time.
create index drink_posts_created_idx on drink_posts (created_at desc);
create index check_ins_arrived_idx on check_ins (arrived_at desc);

-- Mutual silence: neither person sees the other's posts, comments or check-ins,
-- and neither can leave anything under the other's photo. The friendship, if
-- there is one, is left alone — removing someone is a separate, louder act.
create table user_blocks (
  blocker_id uuid not null references profiles (id) on delete cascade,
  blocked_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on user_blocks (blocked_id);

alter table user_blocks enable row level security;

create policy user_blocks_select on user_blocks for select to authenticated
  using (blocker_id = auth.uid());

create policy user_blocks_insert on user_blocks for insert to authenticated
  with check (blocker_id = auth.uid());

create policy user_blocks_delete on user_blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- Security definer, and one argument rather than two: the rows the caller can
-- read are only the blocks they wrote, and asking about a pair of strangers is
-- not something the app needs to allow.
create or replace function is_blocked (p_user_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_blocks
    where (blocker_id = auth.uid() and blocked_id = p_user_id)
      or (blocker_id = p_user_id and blocked_id = auth.uid())
  );
$$;

-- One report per person per post. Nobody reads these through the API: they are
-- for whoever moderates, which today is a human with database access.
create table post_reports (
  post_id uuid not null references drink_posts (id) on delete cascade,
  reporter_id uuid not null references profiles (id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  primary key (post_id, reporter_id)
);

alter table post_reports enable row level security;

create policy post_reports_insert on post_reports for insert to authenticated
  with check (reporter_id = auth.uid());

create policy post_reports_select on post_reports for select to authenticated
  using (reporter_id = auth.uid());

-- A blocked person's photos leave your feed, and yours leave theirs.
drop policy drink_posts_select on drink_posts;

create policy drink_posts_select on drink_posts for select to authenticated
  using (
    user_id = auth.uid()
    or (are_friends(auth.uid(), user_id) and not is_blocked(user_id))
  );

create or replace function can_see_drink_post (p_post_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from drink_posts p
    where p.id = p_post_id
      and (
        p.user_id = auth.uid()
        or (are_friends(auth.uid(), p.user_id) and not is_blocked(p.user_id))
      )
  );
$$;

-- A blocked friend's comment is hidden from you, and yours from them, without
-- the thread disappearing for everyone else who can see the photo.
create or replace function drink_post_comments_for (p_post_id uuid) returns table (
  id uuid,
  author_id uuid,
  display_name text,
  avatar_url text,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.author_id, p.display_name, p.avatar_url, c.body, c.created_at
  from drink_post_comments c
  join profiles p on p.id = c.author_id
  where can_see_drink_post(p_post_id)
    and c.post_id = p_post_id
    and not is_blocked(c.author_id)
  order by c.created_at;
$$;

-- One page of the feed, newest first: your friends' photos and their arrivals,
-- and your own alongside them.
--
-- Paged on created_at rather than an offset, because the feed grows at the top
-- and an offset would repeat rows as it does.
create or replace function feed_page (
  p_before timestamptz default null,
  p_limit integer default 20
) returns table (
  kind text,
  id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  bar_id uuid,
  bar_name text,
  bar_city text,
  bar_state text,
  beer_name text,
  description text,
  rating smallint,
  image_path text,
  comments bigint,
  reactions bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with items as (
    select 'post' as kind,
      p.id,
      p.user_id,
      author.display_name,
      author.avatar_url,
      p.bar_id,
      p.bar_name,
      b.city as bar_city,
      b.state as bar_state,
      p.beer_name,
      p.description,
      p.rating,
      p.image_path,
      (select count(*) from drink_post_comments c where c.post_id = p.id) as comments,
      (select count(*) from drink_post_reactions r where r.post_id = p.id) as reactions,
      p.created_at
    from drink_posts p
    join profiles author on author.id = p.user_id
    left join bars b on b.id = p.bar_id
    where (p.user_id = auth.uid() or are_friends(auth.uid(), p.user_id))
      and not is_blocked(p.user_id)

    union all

    select 'check_in' as kind,
      c.id,
      c.user_id,
      friend.display_name,
      friend.avatar_url,
      c.bar_id,
      b.name as bar_name,
      b.city as bar_city,
      b.state as bar_state,
      null::text as beer_name,
      null::text as description,
      null::smallint as rating,
      null::text as image_path,
      0::bigint as comments,
      0::bigint as reactions,
      c.arrived_at as created_at
    from check_ins c
    join profiles friend on friend.id = c.user_id
    join bars b on b.id = c.bar_id
    where (c.user_id = auth.uid() or are_friends(auth.uid(), c.user_id))
      and not is_blocked(c.user_id)
  )
  select * from items
  where auth.uid() is not null
    and (p_before is null or items.created_at < p_before)
  order by items.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- The one post a feed card or a notification tap opens, with its author, in the
-- shape the feed already renders.
create or replace function feed_post (p_post_id uuid) returns table (
  kind text,
  id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  bar_id uuid,
  bar_name text,
  bar_city text,
  bar_state text,
  beer_name text,
  description text,
  rating smallint,
  image_path text,
  comments bigint,
  reactions bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select 'post',
    p.id,
    p.user_id,
    author.display_name,
    author.avatar_url,
    p.bar_id,
    p.bar_name,
    b.city,
    b.state,
    p.beer_name,
    p.description,
    p.rating,
    p.image_path,
    (select count(*) from drink_post_comments c where c.post_id = p.id),
    (select count(*) from drink_post_reactions r where r.post_id = p.id),
    p.created_at
  from drink_posts p
  join profiles author on author.id = p.user_id
  left join bars b on b.id = p.bar_id
  where p.id = p_post_id and can_see_drink_post(p.id);
$$;

-- Blocking is a call rather than a bare insert so a repeat tap is a no-op
-- instead of a duplicate key error in the user's face.
create or replace function block_user (p_user_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'cannot block yourself';
  end if;

  insert into user_blocks (blocker_id, blocked_id)
  values (auth.uid(), p_user_id)
  on conflict do nothing;
end;
$$;

create or replace function unblock_user (p_user_id uuid) returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from user_blocks where blocker_id = auth.uid() and blocked_id = p_user_id;
$$;

-- Who you blocked, by name, so a block can be undone from the app. Security
-- definer because a blocked person is not necessarily someone whose profile the
-- caller may otherwise read.
create or replace function blocked_users () returns table (
  id uuid,
  display_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar_url
  from user_blocks b
  join profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by p.display_name;
$$;

-- Reporting the same post twice replaces the reason rather than failing.
create or replace function report_post (p_post_id uuid, p_reason text) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not can_see_drink_post(p_post_id) then
    raise exception 'unknown post %', p_post_id;
  end if;

  insert into post_reports (post_id, reporter_id, reason)
  values (p_post_id, auth.uid(), p_reason)
  on conflict (post_id, reporter_id) do update set reason = excluded.reason;
end;
$$;

revoke all on function feed_page (timestamptz, integer) from public, anon, authenticated;
revoke all on function feed_post (uuid) from public, anon, authenticated;
revoke all on function block_user (uuid) from public, anon, authenticated;
revoke all on function unblock_user (uuid) from public, anon, authenticated;
revoke all on function report_post (uuid, text) from public, anon, authenticated;
revoke all on function blocked_users () from public, anon, authenticated;

grant execute on function feed_page (timestamptz, integer) to authenticated;
grant execute on function feed_post (uuid) to authenticated;
grant execute on function block_user (uuid) to authenticated;
grant execute on function unblock_user (uuid) to authenticated;
grant execute on function report_post (uuid, text) to authenticated;
grant execute on function blocked_users () to authenticated;
