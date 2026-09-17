-- Sharing a friend's photo onto your own feed.
--
-- This is the first thing in the app that shows a photo to someone who is not
-- the poster's friend: a share carries the photo to the sharer's accepted
-- friends, and no further on its own. Someone the share reached can share it in
-- turn, which is a second deliberate act by someone already allowed to see it,
-- so the audience only ever grows through a person putting the photo in front of
-- friends who accepted them.
--
-- There is one thread per photo, not one per share. Whoever can see the photo
-- reads and writes the same comments and reactions, so the owner sees
-- everything said about their picture instead of conversations splitting into
-- copies of it.

create table post_reshares (
  id uuid primary key default gen_random_uuid (),
  post_id uuid not null references drink_posts (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index post_reshares_created_idx on post_reshares (created_at desc);
create index post_reshares_user_idx on post_reshares (user_id);

-- The feed reaches a photo through its object path when signing storage URLs.
create index drink_posts_image_idx on drink_posts (image_path);

-- Security definer because the policies below would otherwise read drink_posts
-- through its own row level security and recurse.
create or replace function owns_drink_post (p_post_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from drink_posts where id = p_post_id and user_id = auth.uid()
  );
$$;

-- Whether the photo reached you by way of someone sharing it: you shared it, or
-- a friend you accepted did and you have not blocked them.
create or replace function post_reshared_to_me (p_post_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from post_reshares s
    where s.post_id = p_post_id
      and (
        s.user_id = auth.uid()
        or (are_friends(auth.uid(), s.user_id) and not is_blocked(s.user_id))
      )
  );
$$;

alter table post_reshares enable row level security;

create policy post_reshares_select on post_reshares for select to authenticated
  using (
    user_id = auth.uid()
    or (are_friends(auth.uid(), user_id) and not is_blocked(user_id))
  );

-- Your own share, of a photo you can already see, and not of your own photo:
-- it is on your feed as it is.
create policy post_reshares_insert on post_reshares for insert to authenticated
  with check (
    user_id = auth.uid()
    and can_see_drink_post(post_id)
    and not owns_drink_post(post_id)
  );

-- The sharer takes their own share back. The photo's owner cannot: pulling a
-- share would leave the comments it gathered hanging, and a photo they want
-- gone is theirs to delete.
create policy post_reshares_delete on post_reshares for delete to authenticated
  using (user_id = auth.uid());

-- A shared photo is readable by the sharer's friends too, which every read of a
-- post already goes through.
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
  ) or post_reshared_to_me(p_post_id);
$$;

drop policy drink_posts_select on drink_posts;

create policy drink_posts_select on drink_posts for select to authenticated
  using (
    user_id = auth.uid()
    or (are_friends(auth.uid(), user_id) and not is_blocked(user_id))
    or post_reshared_to_me(id)
  );

-- Tells the owner their photo travelled. Mutes apply the way they do to
-- comments; a share of your own photo is not possible, so there is no self case
-- to skip.
create or replace function enqueue_post_reshare_event () returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  actor_name text;
begin
  select user_id into owner_id from drink_posts where id = new.post_id;
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

  insert into notification_outbox (recipient_id, actor_id, event, body, post_id)
  values (
    owner_id,
    new.user_id,
    'reshared',
    actor_name || ' shared your photo with their friends',
    new.post_id
  );

  return new;
end;
$$;

create trigger post_reshares_event
after insert on post_reshares
for each row
execute function enqueue_post_reshare_event ();

-- Sharing is a call rather than a bare insert so a repeat tap is a no-op and
-- the reasons it can be refused read as sentences.
create or replace function share_post (p_post_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if owns_drink_post(p_post_id) then
    raise exception 'that photo is already on your feed';
  end if;

  if not can_see_drink_post(p_post_id) then
    raise exception 'unknown post %', p_post_id;
  end if;

  insert into post_reshares (post_id, user_id)
  values (p_post_id, auth.uid())
  on conflict do nothing;
end;
$$;

create or replace function unshare_post (p_post_id uuid) returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from post_reshares where post_id = p_post_id and user_id = auth.uid();
$$;

-- The feed now carries shares alongside photos and visits. A share is its own
-- row — the sharer's name at the top, the photographer's underneath — and it
-- points back at the one post, which is where its thread lives.
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
  -- Whether you have shared this photo, on a row of the photo or of a share.
  shared_by_me boolean,
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
      s.created_at
    -- One card per photo: a share only earns its own row for someone who could
    -- not already see the photo, and when several people you know shared the
    -- same one it is credited to yourself first, then to the latest sharer.
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
    case when p_kind = 'check_out' then c.departed_at else c.arrived_at end
  from check_ins c
  join profiles friend on friend.id = c.user_id
  join bars b on b.id = c.bar_id
  where c.id = p_visit_id
    and p_kind in ('check_in', 'check_out')
    and (p_kind = 'check_in' or c.departed_at is not null)
    and can_see_visit(c.id);
$$;

-- A shared photo has to be readable as an object too, or the card renders a
-- grey square for everyone the share reached.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    return;
  end if;

  execute 'drop policy if exists photos_select on storage.objects';

  execute $policy$
    create policy photos_select on storage.objects for select to authenticated
      using (
        bucket_id = 'avatars'
        or (
          bucket_id = 'drinks'
          and (
            storage_object_owner(name) = auth.uid()
            or are_friends(auth.uid(), storage_object_owner(name))
            or exists (
              select 1 from drink_posts p
              where p.image_path = storage.objects.name
                and post_reshared_to_me(p.id)
            )
          )
        )
      );
  $policy$;
end
$$;

revoke all on function owns_drink_post (uuid) from public, anon, authenticated;
revoke all on function post_reshared_to_me (uuid) from public, anon, authenticated;
revoke all on function feed_page (timestamptz, integer) from public, anon, authenticated;
revoke all on function feed_post (uuid) from public, anon, authenticated;
revoke all on function feed_visit (uuid, text) from public, anon, authenticated;
revoke all on function share_post (uuid) from public, anon, authenticated;
revoke all on function unshare_post (uuid) from public, anon, authenticated;

grant execute on function owns_drink_post (uuid) to authenticated;
grant execute on function post_reshared_to_me (uuid) to authenticated;
grant execute on function feed_page (timestamptz, integer) to authenticated;
grant execute on function feed_post (uuid) to authenticated;
grant execute on function feed_visit (uuid, text) to authenticated;
grant execute on function share_post (uuid) to authenticated;
grant execute on function unshare_post (uuid) to authenticated;
