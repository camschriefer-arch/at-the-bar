-- Comments and emoji reactions on a drink post.
--
-- Audience is the post's audience: the owner and the friends they accepted.
-- Two people can therefore meet in a thread without being friends of each
-- other, so the readers below expose a commenter's name and avatar to everyone
-- who can already see the post.

create table drink_post_comments (
  id uuid primary key default gen_random_uuid (),
  post_id uuid not null references drink_posts (id) on delete cascade,
  author_id uuid not null references profiles (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index drink_post_comments_post_idx on drink_post_comments (post_id, created_at);

-- One row per emoji per person, so a reaction toggles by inserting or deleting.
create table drink_post_reactions (
  post_id uuid not null references drink_posts (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

create index drink_post_reactions_post_idx on drink_post_reactions (post_id);

-- Security definer because the policies below would otherwise read drink_posts
-- through its own row level security and recurse.
create or replace function can_see_drink_post (p_post_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from drink_posts p
    where p.id = p_post_id
      and (p.user_id = auth.uid() or are_friends(auth.uid(), p.user_id))
  );
$$;

alter table drink_post_comments enable row level security;
alter table drink_post_reactions enable row level security;

create policy drink_post_comments_select on drink_post_comments for select to authenticated
  using (can_see_drink_post(post_id));

create policy drink_post_comments_insert on drink_post_comments for insert to authenticated
  with check (author_id = auth.uid() and can_see_drink_post(post_id));

-- The person who wrote it, and the owner of the photo it hangs under.
create policy drink_post_comments_delete on drink_post_comments for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from drink_posts p where p.id = post_id and p.user_id = auth.uid()
    )
  );

create policy drink_post_reactions_select on drink_post_reactions for select to authenticated
  using (can_see_drink_post(post_id));

create policy drink_post_reactions_insert on drink_post_reactions for insert to authenticated
  with check (user_id = auth.uid() and can_see_drink_post(post_id));

create policy drink_post_reactions_delete on drink_post_reactions for delete to authenticated
  using (user_id = auth.uid());

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
  where can_see_drink_post(p_post_id) and c.post_id = p_post_id
  order by c.created_at;
$$;

-- Counts rather than rows: who reacted is only ever rendered as a total.
create or replace function drink_post_reactions_for (p_post_id uuid) returns table (
  emoji text,
  reactions bigint,
  reacted boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.emoji,
    count(*),
    bool_or(r.user_id = auth.uid())
  from drink_post_reactions r
  where can_see_drink_post(p_post_id) and r.post_id = p_post_id
  group by r.emoji
  order by count(*) desc, r.emoji;
$$;

revoke all on function can_see_drink_post (uuid) from public, anon, authenticated;
revoke all on function drink_post_comments_for (uuid) from public, anon, authenticated;
revoke all on function drink_post_reactions_for (uuid) from public, anon, authenticated;

grant execute on function can_see_drink_post (uuid) to authenticated;
grant execute on function drink_post_comments_for (uuid) to authenticated;
grant execute on function drink_post_reactions_for (uuid) to authenticated;
