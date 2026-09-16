-- Comments and emoji reactions on a visit, the same way a photo has them.
--
-- A visit has two ends and the feed shows both, so the subject is the check-in
-- row plus which end of it: "Dan is at Jake n JOES" and "Dan has left Jake n
-- JOES" carry their own threads rather than sharing one.
--
-- The audience is the visit's audience — the person and the friends they
-- accepted — which is the rule the feed already runs on.

create table visit_comments (
  id uuid primary key default gen_random_uuid (),
  visit_id uuid not null references check_ins (id) on delete cascade,
  kind text not null check (kind in ('check_in', 'check_out')),
  author_id uuid not null references profiles (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index visit_comments_visit_idx on visit_comments (visit_id, kind, created_at);

create table visit_reactions (
  visit_id uuid not null references check_ins (id) on delete cascade,
  kind text not null check (kind in ('check_in', 'check_out')),
  user_id uuid not null references profiles (id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (visit_id, kind, user_id, emoji)
);

create index visit_reactions_visit_idx on visit_reactions (visit_id, kind);

-- Security definer because the policies below would otherwise read check_ins
-- through its own row level security and recurse.
create or replace function can_see_visit (p_visit_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from check_ins c
    where c.id = p_visit_id
      and (
        c.user_id = auth.uid()
        or (are_friends(auth.uid(), c.user_id) and not is_blocked(c.user_id))
      )
  );
$$;

alter table visit_comments enable row level security;
alter table visit_reactions enable row level security;

create policy visit_comments_select on visit_comments for select to authenticated
  using (can_see_visit(visit_id));

create policy visit_comments_insert on visit_comments for insert to authenticated
  with check (author_id = auth.uid() and can_see_visit(visit_id));

-- The person who wrote it, and whose visit it hangs under.
create policy visit_comments_delete on visit_comments for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from check_ins c where c.id = visit_id and c.user_id = auth.uid()
    )
  );

create policy visit_reactions_select on visit_reactions for select to authenticated
  using (can_see_visit(visit_id));

create policy visit_reactions_insert on visit_reactions for insert to authenticated
  with check (user_id = auth.uid() and can_see_visit(visit_id));

create policy visit_reactions_delete on visit_reactions for delete to authenticated
  using (user_id = auth.uid());

-- Tells you when someone comments on or reacts to your visit, in the words the
-- card uses. Not yourself, and not through a mute.
create or replace function enqueue_visit_comment_event () returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  actor_name text;
begin
  select user_id into owner_id from check_ins where id = new.visit_id;
  if owner_id is null or owner_id = new.author_id then
    return new;
  end if;

  if exists (
    select 1 from notification_mutes m
    where m.muter_id = owner_id and m.muted_id = new.author_id
  ) then
    return new;
  end if;

  select display_name into actor_name from profiles where id = new.author_id;

  insert into notification_outbox (recipient_id, actor_id, event, body)
  values (
    owner_id,
    new.author_id,
    'commented',
    actor_name || ' commented on your night out: ' || left(btrim(new.body), 80)
  );

  return new;
end;
$$;

create trigger visit_comments_event
after insert on visit_comments
for each row
execute function enqueue_visit_comment_event ();

create or replace function enqueue_visit_reaction_event () returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  actor_name text;
begin
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
  values (
    owner_id,
    new.user_id,
    'reacted',
    actor_name || ' reacted ' || new.emoji || ' to your night out'
  );

  return new;
end;
$$;

create trigger visit_reactions_event
after insert on visit_reactions
for each row
execute function enqueue_visit_reaction_event ();

-- The thread and the emoji tally for one subject, shaped for a feed card. A
-- blocked person's comment is missing from your copy and yours from theirs,
-- without the thread disappearing for everyone else.
create or replace function visit_comment_list (p_visit_id uuid, p_kind text) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'author_id', c.author_id,
        'display_name', p.display_name,
        'body', c.body,
        'created_at', c.created_at
      )
      order by c.created_at
    ),
    '[]'::jsonb
  )
  from visit_comments c
  join profiles p on p.id = c.author_id
  where c.visit_id = p_visit_id and c.kind = p_kind and not is_blocked(c.author_id);
$$;

create or replace function visit_reaction_list (p_visit_id uuid, p_kind text) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('emoji', t.emoji, 'reactions', t.reactions, 'reacted', t.reacted)
      order by t.reactions desc, t.emoji
    ),
    '[]'::jsonb
  )
  from (
    select r.emoji, count(*) as reactions, bool_or(r.user_id = auth.uid()) as reacted
    from visit_reactions r
    where r.visit_id = p_visit_id and r.kind = p_kind
    group by r.emoji
  ) t;
$$;

create or replace function post_comment_list (p_post_id uuid) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'author_id', c.author_id,
        'display_name', p.display_name,
        'body', c.body,
        'created_at', c.created_at
      )
      order by c.created_at
    ),
    '[]'::jsonb
  )
  from drink_post_comments c
  join profiles p on p.id = c.author_id
  where c.post_id = p_post_id and not is_blocked(c.author_id);
$$;

create or replace function post_reaction_list (p_post_id uuid) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('emoji', t.emoji, 'reactions', t.reactions, 'reacted', t.reacted)
      order by t.reactions desc, t.emoji
    ),
    '[]'::jsonb
  )
  from (
    select r.emoji, count(*) as reactions, bool_or(r.user_id = auth.uid()) as reacted
    from drink_post_reactions r
    where r.post_id = p_post_id
    group by r.emoji
  ) t;
$$;

-- The feed carries its own comments and reactions now, rather than a count and
-- a screen to go and find them on: a thread you can read where it happened is
-- the point of a wall. They ride along as json so one page is one round trip
-- instead of one per card.
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
  comments bigint,
  reactions bigint,
  comment_list jsonb,
  reaction_list jsonb,
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
      post_comment_list(p.id) as comment_list,
      post_reaction_list(p.id) as reaction_list,
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
  comments bigint,
  reactions bigint,
  comment_list jsonb,
  reaction_list jsonb,
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
    post_comment_list(p.id),
    post_reaction_list(p.id),
    p.created_at
  from drink_posts p
  join profiles author on author.id = p.user_id
  left join bars b on b.id = p.bar_id
  where p.id = p_post_id and can_see_drink_post(p.id);
$$;

-- One end of one visit, in the shape the feed renders, so a card that was just
-- commented on can be replaced where it sits instead of the page it belongs to
-- being fetched again underneath the reader.
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
  comments bigint,
  reactions bigint,
  comment_list jsonb,
  reaction_list jsonb,
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
    case when p_kind = 'check_out' then c.departed_at else c.arrived_at end
  from check_ins c
  join profiles friend on friend.id = c.user_id
  join bars b on b.id = c.bar_id
  where c.id = p_visit_id
    and p_kind in ('check_in', 'check_out')
    and (p_kind = 'check_in' or c.departed_at is not null)
    and can_see_visit(c.id);
$$;

-- The lists are only ever read through the feed, which is itself definer.
revoke all on function visit_comment_list (uuid, text) from public, anon, authenticated;
revoke all on function visit_reaction_list (uuid, text) from public, anon, authenticated;
revoke all on function post_comment_list (uuid) from public, anon, authenticated;
revoke all on function post_reaction_list (uuid) from public, anon, authenticated;

revoke all on function can_see_visit (uuid) from public, anon, authenticated;
revoke all on function feed_page (timestamptz, integer) from public, anon, authenticated;
revoke all on function feed_post (uuid) from public, anon, authenticated;
revoke all on function feed_visit (uuid, text) from public, anon, authenticated;

grant execute on function can_see_visit (uuid) to authenticated;
grant execute on function feed_page (timestamptz, integer) to authenticated;
grant execute on function feed_post (uuid) to authenticated;
grant execute on function feed_visit (uuid, text) to authenticated;
