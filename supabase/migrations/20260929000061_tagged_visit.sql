-- The push that says a friend named you carries Yes and No buttons, and an
-- answer from a button never opens the screen that knows which visit was
-- being asked about, so the visit has to travel with the notification.

alter table notification_outbox
add column if not exists visit_id uuid references check_ins (id) on delete cascade;

create or replace function enqueue_companion_tag_event () returns trigger language plpgsql security definer
set
  search_path = public as $$
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

  insert into notification_outbox (recipient_id, actor_id, event, body, visit_id)
  values (
    new.user_id,
    owner_id,
    'tagged',
    actor_name || ' says you are with them at ' || venue_name,
    new.visit_id
  );

  return new;
end;
$$;

-- Unchanged but for the trailing column, which the return type makes a drop
-- and recreate rather than a replace.
drop function claim_push_batch (integer);

create function claim_push_batch (p_limit integer default 100) returns table (
  id bigint,
  recipient_id uuid,
  actor_id uuid,
  event bar_event,
  body text,
  token text,
  post_id uuid,
  image_path text,
  visit_id uuid
)
language sql
security definer
set
  search_path = public as $$
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
  select c.id, c.recipient_id, c.actor_id, c.event, c.body, t.token, c.post_id, p.image_path, c.visit_id
  from claimed c
  join push_tokens t on t.user_id = c.recipient_id
  left join drink_posts p on p.id = c.post_id;
$$;

revoke all on function claim_push_batch (integer) from public, anon, authenticated;

grant execute on function claim_push_batch (integer) to service_role;
