-- Two things: friend groups, and "shhhh".
--
-- A friend group is a private label. Nobody but its owner ever sees one, so a
-- friend cannot tell which group they are in, or that groups exist at all, and
-- one friend can sit in several.
--
-- A shhhh goes the other way round from a mute. Muting someone stops *their*
-- events reaching *you*; a shhhh stops *you* reaching *them*: they see no
-- status, no arrivals or departures, no venue history, no photos, and get no
-- push about you until it lifts. It is deliberately temporary — 24 hours by
-- default — so nobody is quietly invisible to a friend forever, and the row
-- itself is only readable by the person who went quiet.

create table friend_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index friend_groups_owner_name_idx on friend_groups (owner_id, lower(name));

create table friend_group_members (
  group_id uuid not null references friend_groups (id) on delete cascade,
  member_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, member_id)
);

create table shushes (
  shusher_id uuid not null references profiles (id) on delete cascade,
  shushed_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (shusher_id, shushed_id),
  check (shusher_id <> shushed_id)
);

create index shushes_shushed_idx on shushes (shushed_id, expires_at desc);

alter table friend_groups enable row level security;
alter table friend_group_members enable row level security;
alter table shushes enable row level security;

create policy friend_groups_all on friend_groups for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy friend_group_members_all on friend_group_members for all to authenticated
  using (exists (select 1 from friend_groups g where g.id = group_id and g.owner_id = auth.uid()))
  with check (exists (select 1 from friend_groups g where g.id = group_id and g.owner_id = auth.uid()));

-- Only the person who went quiet can read their own shushes: the whole point is
-- that the other side is not told.
create policy shushes_all on shushes for all to authenticated
  using (shusher_id = auth.uid())
  with check (shusher_id = auth.uid());

/** Whether p_subject is currently hiding from p_viewer. Expiry is read, not swept. */
create or replace function is_shushed (p_subject uuid, p_viewer uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from shushes s
    where s.shusher_id = p_subject
      and s.shushed_id = p_viewer
      and s.expires_at > now()
  );
$$;

-- The two predicates every read path already goes through, so a shhhh lands
-- everywhere at once rather than being bolted onto each query.
--
-- are_friends(a, b) has always been read as "may a see b" — every caller passes
-- the viewer first — so it is the natural place for it: a friendship that b has
-- shushed a out of stops counting in a's direction only, and b keeps seeing a.
create or replace function are_friends (a uuid, b uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  ) and not is_shushed(b, a);
$$;

-- The feed asks "is this person hidden from me" as is_blocked(), including for
-- people who are not friends: a photo that reached you through someone else's
-- reshare, and the authors of comments under it. Someone who shushed you is
-- hidden from you in exactly that sense.
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
  ) or is_shushed(p_user_id, auth.uid());
$$;

-- A share is the one way a photo reaches someone who is not the photographer's
-- friend, and it is checked against the sharer rather than the photographer, so
-- it needs saying here as well: a photo cannot travel to someone its owner has
-- gone quiet for.
create or replace function post_reshared_to_me (p_post_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from post_reshares s
    join drink_posts p on p.id = s.post_id
    where s.post_id = p_post_id
      and not is_shushed(p.user_id, auth.uid())
      and (
        s.user_id = auth.uid()
        or (are_friends(auth.uid(), s.user_id) and not is_blocked(s.user_id))
      )
  );
$$;

-- friend_feed reads user_status through a join rather than the policy, so the
-- shhhh has to be applied by hand here: the friend stays in the list, with
-- nothing to say about where they are.
create or replace function friend_feed () returns table (
  friend_id uuid,
  display_name text,
  avatar_url text,
  bar_id uuid,
  bar_name text,
  bar_city text,
  bar_state text,
  bar_lat double precision,
  bar_lng double precision,
  arrived_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
    p.display_name,
    p.avatar_url,
    b.id,
    b.name,
    b.city,
    b.state,
    b.lat,
    b.lng,
    s.arrived_at
  from friendships f
  join profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  left join user_status s on s.user_id = p.id and not is_shushed(p.id, auth.uid())
  left join bars b on b.id = s.bar_id
  where f.status = 'accepted'
    and auth.uid() in (f.requester_id, f.addressee_id)
  order by (b.id is null), s.arrived_at desc nulls last, p.display_name;
$$;

-- Both event triggers pick their recipients straight out of friendships, so
-- they need the same clause the mute check already has next to it.
create or replace function enqueue_bar_event () returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_bar uuid;
  kind bar_event;
  actor_name text;
begin
  if tg_op = 'UPDATE' then
    previous_bar := old.bar_id;
  end if;

  if previous_bar is null and new.bar_id is not null then
    kind := 'arrived';
  elsif previous_bar is not null and new.bar_id is null then
    kind := 'left';
  else
    return new;
  end if;

  select display_name into actor_name from profiles where id = new.user_id;

  insert into notification_outbox (recipient_id, actor_id, event, body)
  select recipient.id,
    new.user_id,
    kind,
    case when kind = 'arrived'
      then actor_name || ' is at the bar'
      else actor_name || ' has left the bar'
    end
  from friendships f
  cross join lateral (
    select case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end as id
  ) recipient
  where f.status = 'accepted'
    and new.user_id in (f.requester_id, f.addressee_id)
    and not is_shushed(new.user_id, recipient.id)
    and not exists (
      select 1
      from notification_mutes m
      where m.muter_id = recipient.id and m.muted_id = new.user_id
    );

  return new;
end;
$$;

create or replace function enqueue_drink_post_event () returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
begin
  select display_name into actor_name from profiles where id = new.user_id;

  insert into notification_outbox (recipient_id, actor_id, event, body, post_id)
  select recipient.id,
    new.user_id,
    'posted',
    'Check out ' || actor_name || '''s latest beer post at ' || new.bar_name || '!',
    new.id
  from friendships f
  cross join lateral (
    select case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end as id
  ) recipient
  where f.status = 'accepted'
    and new.user_id in (f.requester_id, f.addressee_id)
    and not is_shushed(new.user_id, recipient.id)
    and not exists (
      select 1
      from notification_mutes m
      where m.muter_id = recipient.id and m.muted_id = new.user_id
    );

  return new;
end;
$$;

create or replace function create_friend_group (p_name text) returns friend_groups
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  clean_name text := nullif(btrim(p_name), '');
  result friend_groups;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if clean_name is null then
    raise exception 'a group needs a name';
  end if;

  insert into friend_groups (owner_id, name)
  values (auth.uid(), left(clean_name, 40))
  returning * into result;

  return result;
end;
$$;

create or replace function rename_friend_group (p_group_id uuid, p_name text) returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  clean_name text := nullif(btrim(p_name), '');
begin
  if clean_name is null then
    raise exception 'a group needs a name';
  end if;

  update friend_groups
  set name = left(clean_name, 40)
  where id = p_group_id and owner_id = auth.uid();
end;
$$;

create or replace function delete_friend_group (p_group_id uuid) returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from friend_groups where id = p_group_id and owner_id = auth.uid();
$$;

/** Puts an accepted friend in one of your groups, or takes them out of it. */
create or replace function set_group_membership (
  p_group_id uuid,
  p_user_id uuid,
  p_member boolean
) returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from friend_groups g where g.id = p_group_id and g.owner_id = auth.uid()
  ) then
    raise exception 'unknown group %', p_group_id;
  end if;

  if p_member then
    -- A group is a label on a friendship, so it cannot outlive one; being
    -- shushed does not stop you grouping someone.
    if not exists (
      select 1
      from friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = p_user_id)
          or (f.requester_id = p_user_id and f.addressee_id = auth.uid()))
    ) then
      raise exception 'not your friend';
    end if;

    insert into friend_group_members (group_id, member_id)
    values (p_group_id, p_user_id)
    on conflict do nothing;
  else
    delete from friend_group_members
    where group_id = p_group_id and member_id = p_user_id;
  end if;
end;
$$;

/** Your groups, each with the friends in it, for the Friends screen. */
create or replace function my_friend_groups () returns table (
  group_id uuid,
  name text,
  member_ids uuid[],
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id,
    g.name,
    coalesce(
      array_agg(m.member_id order by m.created_at) filter (where m.member_id is not null),
      '{}'::uuid[]
    ),
    g.created_at
  from friend_groups g
  left join friend_group_members m on m.group_id = g.id
  where g.owner_id = auth.uid()
  group by g.id, g.name, g.created_at
  order by g.created_at;
$$;

/** Who you are currently hidden from, and until when. */
create or replace function my_shushes () returns table (user_id uuid, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select shushed_id, expires_at
  from shushes
  where shusher_id = auth.uid() and expires_at > now();
$$;

/** Goes quiet for one friend, and says when it lifts. Re-shushing restarts it. */
create or replace function shush_friend (p_user_id uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  until timestamptz := now() + interval '24 hours';
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'cannot hide from yourself';
  end if;

  insert into shushes (shusher_id, shushed_id, expires_at)
  values (auth.uid(), p_user_id, until)
  on conflict (shusher_id, shushed_id) do update
    set expires_at = excluded.expires_at, created_at = now();

  return until;
end;
$$;

create or replace function unshush_friend (p_user_id uuid) returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from shushes where shusher_id = auth.uid() and shushed_id = p_user_id;
$$;

/** The same, for everyone in one of your groups. */
create or replace function shush_group (p_group_id uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  until timestamptz := now() + interval '24 hours';
begin
  if not exists (
    select 1 from friend_groups g where g.id = p_group_id and g.owner_id = auth.uid()
  ) then
    raise exception 'unknown group %', p_group_id;
  end if;

  insert into shushes (shusher_id, shushed_id, expires_at)
  select auth.uid(), m.member_id, until
  from friend_group_members m
  where m.group_id = p_group_id and m.member_id <> auth.uid()
  on conflict (shusher_id, shushed_id) do update
    set expires_at = excluded.expires_at, created_at = now();

  return until;
end;
$$;

create or replace function unshush_group (p_group_id uuid) returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from shushes
  where shusher_id = auth.uid()
    and shushed_id in (
      select m.member_id
      from friend_group_members m
      join friend_groups g on g.id = m.group_id
      where m.group_id = p_group_id and g.owner_id = auth.uid()
    );
$$;

revoke all on function is_shushed (uuid, uuid) from public, anon, authenticated;
revoke all on function create_friend_group (text) from public;
revoke all on function rename_friend_group (uuid, text) from public;
revoke all on function delete_friend_group (uuid) from public;
revoke all on function set_group_membership (uuid, uuid, boolean) from public;
revoke all on function my_friend_groups () from public;
revoke all on function my_shushes () from public;
revoke all on function shush_friend (uuid) from public;
revoke all on function unshush_friend (uuid) from public;
revoke all on function shush_group (uuid) from public;
revoke all on function unshush_group (uuid) from public;

grant execute on function create_friend_group (text) to authenticated;
grant execute on function rename_friend_group (uuid, text) to authenticated;
grant execute on function delete_friend_group (uuid) to authenticated;
grant execute on function set_group_membership (uuid, uuid, boolean) to authenticated;
grant execute on function my_friend_groups () to authenticated;
grant execute on function my_shushes () to authenticated;
grant execute on function shush_friend (uuid) to authenticated;
grant execute on function unshush_friend (uuid) to authenticated;
grant execute on function shush_group (uuid) to authenticated;
grant execute on function unshush_group (uuid) to authenticated;
