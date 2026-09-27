-- Says who commented, and nothing else.
--
-- The push used to carry the first 80 characters of the comment and, for a
-- visit, called it a night out. A lock screen is the wrong place to read
-- someone's words, and "night out" named nothing the rest of the app calls a
-- night out, so both now read "Warren commented on your post" and the comment
-- is read where it was written.

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
  values (owner_id, new.author_id, 'commented', actor_name || ' commented on your post');

  return new;
end;
$$;

create or replace function enqueue_post_comment_event () returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  actor_name text;
begin
  select user_id into owner_id from drink_posts where id = new.post_id;
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

  insert into notification_outbox (recipient_id, actor_id, event, body, post_id)
  values (
    owner_id,
    new.author_id,
    'commented',
    actor_name || ' commented on your post',
    new.post_id
  );

  return new;
end;
$$;
