-- Who you are out with.
--
-- A check-in already says where someone is; this says who is standing next to
-- them. Only friends who are checked in at the same venue can be named, and
-- naming someone is a claim about them, so it waits for their yes: until then
-- the pairing is visible to the two people involved and nobody else.
--
-- Hiding cuts both ways here. Someone you are hidden from never appears in the
-- list, and neither does someone hiding from you — being named is exactly the
-- sort of thing a shhhh is for.

create table visit_companions (
  visit_id uuid not null references check_ins (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  primary key (visit_id, user_id)
);

create index visit_companions_user_idx on visit_companions (user_id, status);

alter table visit_companions enable row level security;

-- Every write goes through a function below, which is where the friendship and
-- the same-venue rule are enforced; the policy only has to keep a pending claim
-- between the two people it is about.
create policy visit_companions_select on visit_companions for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from check_ins c where c.id = visit_id and c.user_id = auth.uid())
  );

/**
 * The friends you could say you are with: accepted friends whose current status
 * is this venue, minus anyone either of you is hidden from, minus blocks.
 */
create or replace function friends_at_bar (p_bar_id uuid) returns table (
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
  from user_status s
  join profiles p on p.id = s.user_id
  where auth.uid() is not null
    and s.bar_id = p_bar_id
    and p.id <> auth.uid()
    and are_friends(auth.uid(), p.id)
    and not is_blocked(p.id)
    and not is_shushed(auth.uid(), p.id)
  order by p.display_name;
$$;

/**
 * Names the people you are with on your current visit. The list replaces
 * whatever was there: ticking someone off removes them, and someone who already
 * said yes stays said-yes rather than being asked again.
 */
create or replace function set_visit_companions (p_visit_id uuid, p_user_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  visit check_ins;
  wanted uuid[] := coalesce(p_user_ids, '{}'::uuid[]);
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into visit from check_ins where id = p_visit_id and user_id = auth.uid();
  if visit.id is null then
    raise exception 'unknown visit %', p_visit_id;
  end if;

  if visit.departed_at is not null then
    raise exception 'that visit has ended';
  end if;

  if exists (
    select 1
    from unnest(wanted) as candidate (id)
    where candidate.id not in (select f.id from friends_at_bar (visit.bar_id) f)
  ) then
    raise exception 'that person is not at this venue';
  end if;

  delete from visit_companions
  where visit_id = p_visit_id and user_id <> all (wanted);

  insert into visit_companions (visit_id, user_id)
  select p_visit_id, candidate.id from unnest(wanted) as candidate (id)
  on conflict (visit_id, user_id) do nothing;
end;
$$;

/** Yes or no to being named on someone else's visit. */
create or replace function respond_to_companion_tag (p_visit_id uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update visit_companions
  set status = case when p_accept then 'accepted' else 'declined' end
  where visit_id = p_visit_id and user_id = auth.uid();

  if not found then
    raise exception 'nobody said you were with them';
  end if;
end;
$$;

/** The claims waiting on you, newest first, for the prompt on the You tab. */
create or replace function my_companion_tags () returns table (
  visit_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  bar_id uuid,
  bar_name text,
  arrived_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
    c.user_id,
    p.display_name,
    p.avatar_url,
    b.id,
    b.name,
    c.arrived_at
  from visit_companions t
  join check_ins c on c.id = t.visit_id
  join profiles p on p.id = c.user_id
  join bars b on b.id = c.bar_id
  where t.user_id = auth.uid()
    and t.status = 'pending'
    and c.departed_at is null
    and not is_blocked(c.user_id)
  order by c.arrived_at desc;
$$;

/**
 * The names a card shows after "with". Someone who has not answered yet is in
 * the list only for the two people it concerns, marked as such, so the person
 * who checked in can see their tick landed without it being public.
 */
create or replace function visit_companion_list (p_visit_id uuid) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', t.user_id,
        'display_name', p.display_name,
        'pending', t.status = 'pending'
      )
      order by p.display_name
    ),
    '[]'::jsonb
  )
  from visit_companions t
  join profiles p on p.id = t.user_id
  join check_ins c on c.id = t.visit_id
  where t.visit_id = p_visit_id
    and t.status <> 'declined'
    and (t.user_id = auth.uid() or not is_blocked(t.user_id))
    and (
      t.status = 'accepted'
      or t.user_id = auth.uid()
      or c.user_id = auth.uid()
    );
$$;

-- Being named is worth a push; saying yes tells the person who named you.
create or replace function enqueue_companion_tag_event () returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  actor_name text;
  venue_name text;
begin
  select c.user_id, b.name into owner_id, venue_name
  from check_ins c
  join bars b on b.id = c.bar_id
  where c.id = new.visit_id;

  if owner_id is null or owner_id = new.user_id then
    return new;
  end if;

  if exists (
    select 1 from notification_mutes m
    where m.muter_id = new.user_id and m.muted_id = owner_id
  ) then
    return new;
  end if;

  select display_name into actor_name from profiles where id = owner_id;

  insert into notification_outbox (recipient_id, actor_id, event, body)
  values (
    new.user_id,
    owner_id,
    'tagged',
    actor_name || ' says you are with them at ' || venue_name
  );

  return new;
end;
$$;

create trigger visit_companions_event
after insert on visit_companions
for each row
execute function enqueue_companion_tag_event ();

create or replace function enqueue_companion_reply_event () returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  actor_name text;
begin
  if new.status <> 'accepted' or old.status = 'accepted' then
    return new;
  end if;

  select user_id into owner_id from check_ins where id = new.visit_id;
  if owner_id is null or owner_id = new.user_id then
    return new;
  end if;

  if exists (
    select 1 from notification_mutes m
    where m.muter_id = owner_id and m.muted_id = new.user_id
  ) then
    return new;
  end if;

  select display_name into actor_name from profiles where id = new.user_id;

  insert into notification_outbox (recipient_id, actor_id, event, body)
  values (owner_id, new.user_id, 'tagged', actor_name || ' is out with you');

  return new;
end;
$$;

create trigger visit_companions_reply_event
after update on visit_companions
for each row
execute function enqueue_companion_reply_event ();

/** The visit the user is on right now, which is what a tag hangs off. */
create or replace function my_current_visit () returns table (
  visit_id uuid,
  bar_id uuid,
  bar_name text,
  arrived_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.bar_id, b.name, c.arrived_at
  from check_ins c
  join bars b on b.id = c.bar_id
  where c.user_id = auth.uid() and c.departed_at is null
  order by c.arrived_at desc
  limit 1;
$$;

-- Every feed row for a visit now carries the people on it.
drop function feed_page (timestamptz, integer);

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
  post_id uuid,
  sharer_id uuid,
  sharer_name text,
  shared_by_me boolean,
  comments bigint,
  reactions bigint,
  comment_list jsonb,
  reaction_list jsonb,
  companion_list jsonb,
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
      p.id as post_id,
      null::uuid as sharer_id,
      null::text as sharer_name,
      exists (
        select 1 from post_reshares mine
        where mine.post_id = p.id and mine.user_id = auth.uid()
      ) as shared_by_me,
      (select count(*) from drink_post_comments c where c.post_id = p.id) as comments,
      (select count(*) from drink_post_reactions r where r.post_id = p.id) as reactions,
      post_comment_list(p.id) as comment_list,
      post_reaction_list(p.id) as reaction_list,
      '[]'::jsonb as companion_list,
      p.created_at
    from drink_posts p
    join profiles author on author.id = p.user_id
    left join bars b on b.id = p.bar_id
    where (p.user_id = auth.uid() or are_friends(auth.uid(), p.user_id))
      and not is_blocked(p.user_id)

    union all

    select 'reshare' as kind,
      s.id,
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
      p.id as post_id,
      s.user_id as sharer_id,
      sharer.display_name as sharer_name,
      exists (
        select 1 from post_reshares mine
        where mine.post_id = p.id and mine.user_id = auth.uid()
      ) as shared_by_me,
      (select count(*) from drink_post_comments c where c.post_id = p.id) as comments,
      (select count(*) from drink_post_reactions r where r.post_id = p.id) as reactions,
      post_comment_list(p.id) as comment_list,
      post_reaction_list(p.id) as reaction_list,
      '[]'::jsonb as companion_list,
      s.created_at
    from (
      select distinct on (share.post_id) share.*
      from post_reshares share
      where (share.user_id = auth.uid() or are_friends(auth.uid(), share.user_id))
        and not is_blocked(share.user_id)
      order by share.post_id, (share.user_id = auth.uid()) desc, share.created_at desc
    ) s
    join drink_posts p on p.id = s.post_id
    join profiles author on author.id = p.user_id
    join profiles sharer on sharer.id = s.user_id
    left join bars b on b.id = p.bar_id
    where p.user_id <> auth.uid()
      and not are_friends(auth.uid(), p.user_id)
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
      null::uuid as post_id,
      null::uuid as sharer_id,
      null::text as sharer_name,
      false as shared_by_me,
      (
        select count(*) from visit_comments vc
        where vc.visit_id = c.id and vc.kind = 'check_in' and not is_blocked(vc.author_id)
      ) as comments,
      (
        select count(*) from visit_reactions vr
        where vr.visit_id = c.id and vr.kind = 'check_in'
      ) as reactions,
      visit_comment_list(c.id, 'check_in') as comment_list,
      visit_reaction_list(c.id, 'check_in') as reaction_list,
      visit_companion_list(c.id) as companion_list,
      c.arrived_at as created_at
    from check_ins c
    join profiles friend on friend.id = c.user_id
    join bars b on b.id = c.bar_id
    where (c.user_id = auth.uid() or are_friends(auth.uid(), c.user_id))
      and not is_blocked(c.user_id)

    union all

    select 'check_out' as kind,
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
      null::uuid as post_id,
      null::uuid as sharer_id,
      null::text as sharer_name,
      false as shared_by_me,
      (
        select count(*) from visit_comments vc
        where vc.visit_id = c.id and vc.kind = 'check_out' and not is_blocked(vc.author_id)
      ) as comments,
      (
        select count(*) from visit_reactions vr
        where vr.visit_id = c.id and vr.kind = 'check_out'
      ) as reactions,
      visit_comment_list(c.id, 'check_out') as comment_list,
      visit_reaction_list(c.id, 'check_out') as reaction_list,
      visit_companion_list(c.id) as companion_list,
      c.departed_at as created_at
    from check_ins c
    join profiles friend on friend.id = c.user_id
    join bars b on b.id = c.bar_id
    where c.departed_at is not null
      and (c.user_id = auth.uid() or are_friends(auth.uid(), c.user_id))
      and not is_blocked(c.user_id)
  )
  select * from items
  where auth.uid() is not null
    and (p_before is null or items.created_at < p_before)
  order by items.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

drop function feed_post (uuid);

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
  post_id uuid,
  sharer_id uuid,
  sharer_name text,
  shared_by_me boolean,
  comments bigint,
  reactions bigint,
  comment_list jsonb,
  reaction_list jsonb,
  companion_list jsonb,
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
    p.id,
    null::uuid,
    null::text,
    exists (
      select 1 from post_reshares mine
      where mine.post_id = p.id and mine.user_id = auth.uid()
    ),
    (select count(*) from drink_post_comments c where c.post_id = p.id),
    (select count(*) from drink_post_reactions r where r.post_id = p.id),
    post_comment_list(p.id),
    post_reaction_list(p.id),
    '[]'::jsonb,
    p.created_at
  from drink_posts p
  join profiles author on author.id = p.user_id
  left join bars b on b.id = p.bar_id
  where p.id = p_post_id and can_see_drink_post(p.id);
$$;

drop function feed_visit (uuid, text);

create or replace function feed_visit (p_visit_id uuid, p_kind text) returns table (
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
  post_id uuid,
  sharer_id uuid,
  sharer_name text,
  shared_by_me boolean,
  comments bigint,
  reactions bigint,
  comment_list jsonb,
  reaction_list jsonb,
  companion_list jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p_kind,
    c.id,
    c.user_id,
    friend.display_name,
    friend.avatar_url,
    c.bar_id,
    b.name,
    b.city,
    b.state,
    null::text,
    null::text,
    null::smallint,
    null::text,
    null::uuid,
    null::uuid,
    null::text,
    false,
    (
      select count(*) from visit_comments vc
      where vc.visit_id = c.id and vc.kind = p_kind and not is_blocked(vc.author_id)
    ),
    (
      select count(*) from visit_reactions vr
      where vr.visit_id = c.id and vr.kind = p_kind
    ),
    visit_comment_list(c.id, p_kind),
    visit_reaction_list(c.id, p_kind),
    visit_companion_list(c.id),
    case when p_kind = 'check_out' then c.departed_at else c.arrived_at end
  from check_ins c
  join profiles friend on friend.id = c.user_id
  join bars b on b.id = c.bar_id
  where c.id = p_visit_id
    and p_kind in ('check_in', 'check_out')
    and (p_kind = 'check_in' or c.departed_at is not null)
    and can_see_visit(c.id);
$$;

revoke all on function feed_page (timestamptz, integer) from public, anon, authenticated;
revoke all on function feed_post (uuid) from public, anon, authenticated;
revoke all on function feed_visit (uuid, text) from public, anon, authenticated;
revoke all on function my_current_visit () from public, anon, authenticated;
revoke all on function friends_at_bar (uuid) from public, anon, authenticated;
revoke all on function set_visit_companions (uuid, uuid[]) from public, anon, authenticated;
revoke all on function respond_to_companion_tag (uuid, boolean) from public, anon, authenticated;
revoke all on function my_companion_tags () from public, anon, authenticated;
revoke all on function visit_companion_list (uuid) from public, anon, authenticated;

grant execute on function feed_page (timestamptz, integer) to authenticated;
grant execute on function feed_post (uuid) to authenticated;
grant execute on function feed_visit (uuid, text) to authenticated;
grant execute on function my_current_visit () to authenticated;
grant execute on function friends_at_bar (uuid) to authenticated;
grant execute on function set_visit_companions (uuid, uuid[]) to authenticated;
grant execute on function respond_to_companion_tag (uuid, boolean) to authenticated;
grant execute on function my_companion_tags () to authenticated;
grant execute on function visit_companion_list (uuid) to authenticated;
