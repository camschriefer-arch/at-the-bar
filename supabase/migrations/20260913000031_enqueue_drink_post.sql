-- Tells accepted friends who have not muted you about a new drink post. Same
-- outbox, same mute rule and same audience as an arrival, so a muted friend
-- stays silent here too.
--
-- The row points at the post rather than carrying its photo: the drinks bucket
-- is private, so the sender signs a URL at delivery time, and deleting the post
-- takes any undelivered notification of it with it.

alter table notification_outbox
  add column post_id uuid references drink_posts (id) on delete cascade;

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
    and not exists (
      select 1
      from notification_mutes m
      where m.muter_id = recipient.id and m.muted_id = new.user_id
    );

  return new;
end;
$$;

create trigger drink_posts_event
after insert on drink_posts
for each row
execute function enqueue_drink_post_event ();

-- Unchanged except for the two trailing columns, which the return type makes a
-- drop and recreate rather than a replace.
drop function claim_push_batch (integer);

create function claim_push_batch (p_limit integer default 100) returns table (
  id bigint,
  recipient_id uuid,
  actor_id uuid,
  event bar_event,
  body text,
  token text,
  post_id uuid,
  image_path text
)
language sql
security definer
set search_path = public
as $$
  with claimed as (
    update notification_outbox o
    set claimed_at = now(), attempts = o.attempts + 1
    where o.id in (
      select candidate.id
      from notification_outbox candidate
      where candidate.sent_at is null
        and candidate.attempts < 5
        and (candidate.claimed_at is null or candidate.claimed_at < now() - interval '5 minutes')
      order by candidate.created_at
      limit greatest(p_limit, 1)
      for update skip locked
    )
    returning o.*
  )
  select c.id, c.recipient_id, c.actor_id, c.event, c.body, t.token, c.post_id, p.image_path
  from claimed c
  join push_tokens t on t.user_id = c.recipient_id
  left join drink_posts p on p.id = c.post_id;
$$;

revoke all on function claim_push_batch (integer) from public, anon, authenticated;
grant execute on function claim_push_batch (integer) to service_role;
