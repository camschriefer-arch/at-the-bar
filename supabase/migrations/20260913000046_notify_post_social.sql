-- Tells you when someone comments on or reacts to one of your photos.
--
-- Only the owner hears about it, and only about other people: a thread between
-- two friends of yours under your photo is yours to see, not theirs to be
-- pushed about, and nobody needs telling about their own tap. Mutes apply the
-- same way they do to arrivals.

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
    actor_name || ' commented on your post: ' || left(btrim(new.body), 80),
    new.post_id
  );

  return new;
end;
$$;

create trigger drink_post_comments_event
after insert on drink_post_comments
for each row
execute function enqueue_post_comment_event ();

create or replace function enqueue_post_reaction_event () returns trigger
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
    'reacted',
    actor_name || ' reacted ' || new.emoji || ' to your post',
    new.post_id
  );

  return new;
end;
$$;

-- A reaction toggles by insert and delete, so re-reacting after undoing one
-- pushes again. That is the same nag as tapping it twice, and the alternative
-- is remembering every emoji anyone ever removed.
create trigger drink_post_reactions_event
after insert on drink_post_reactions
for each row
execute function enqueue_post_reaction_event ();
