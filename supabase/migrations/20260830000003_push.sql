-- Push notifications: friends are told when you arrive at or leave a bar.
--
-- The notification body deliberately names the person and nothing else ("Bob is
-- at the bar"), so the bar itself is only revealed once the friend opens the app
-- and passes the same row level security checks as the friends list.

create type bar_event as enum ('arrived', 'left');

-- Expo push tokens. One row per device; a device can move between accounts, so
-- the token is the primary key and re-registering reassigns it.
create table push_tokens (
  token text primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on push_tokens (user_id);

-- Queued notifications. Rows are written by a trigger inside the same
-- transaction as the status change and drained by the send-push function, so a
-- delivery outage never loses or duplicates a check-in.
create table notification_outbox (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references profiles (id) on delete cascade,
  actor_id uuid not null references profiles (id) on delete cascade,
  event bar_event not null,
  body text not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text
);

create index notification_outbox_pending_idx on notification_outbox (created_at)
  where sent_at is null;

alter table push_tokens enable row level security;
alter table notification_outbox enable row level security;

-- Devices are managed by their owner. The outbox has no policies at all: only
-- the service role key used by the send-push function can read it.
create policy push_tokens_select on push_tokens for select to authenticated
  using (user_id = auth.uid());

create policy push_tokens_delete on push_tokens for delete to authenticated
  using (user_id = auth.uid());

create or replace function register_push_token (p_token text, p_platform text) returns push_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  result push_tokens;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
      platform = excluded.platform,
      updated_at = now()
  returning * into result;

  return result;
end;
$$;

create or replace function unregister_push_token (p_token text) returns void
language sql
security definer
set search_path = public
as $$
  delete from push_tokens where token = p_token and user_id = auth.uid();
$$;

-- Arriving at a bar or leaving one is news; moving between two bars is not,
-- because the friend's status stays "at the bar" either way.
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
  select case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end,
    new.user_id,
    kind,
    case when kind = 'arrived'
      then actor_name || ' is at the bar'
      else actor_name || ' has left the bar'
    end
  from friendships f
  where f.status = 'accepted'
    and new.user_id in (f.requester_id, f.addressee_id);

  return new;
end;
$$;

create trigger user_status_bar_event
after insert or update of bar_id on user_status
for each row
execute function enqueue_bar_event ();

-- Hands the sender a batch of unsent notifications joined to the recipient's
-- devices. Rows are claimed rather than deleted so a crashed send retries.
create or replace function claim_push_batch (p_limit integer default 100) returns table (
  id bigint,
  recipient_id uuid,
  actor_id uuid,
  event bar_event,
  body text,
  token text
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
  select c.id, c.recipient_id, c.actor_id, c.event, c.body, t.token
  from claimed c
  join push_tokens t on t.user_id = c.recipient_id;
$$;

create or replace function mark_push_sent (p_ids bigint[]) returns void
language sql
security definer
set search_path = public
as $$
  update notification_outbox set sent_at = now(), last_error = null
  where id = any (p_ids);
$$;

create or replace function mark_push_failed (p_ids bigint[], p_error text) returns void
language sql
security definer
set search_path = public
as $$
  update notification_outbox set claimed_at = null, last_error = p_error
  where id = any (p_ids);
$$;

-- Expo rejects tokens for uninstalled apps; drop them so the queue drains.
create or replace function drop_push_tokens (p_tokens text[]) returns void
language sql
security definer
set search_path = public
as $$
  delete from push_tokens where token = any (p_tokens);
$$;

create or replace function prune_notification_outbox () returns void
language sql
security definer
set search_path = public
as $$
  delete from notification_outbox
  where (sent_at is not null and sent_at < now() - interval '7 days')
    or (sent_at is null and attempts >= 5 and created_at < now() - interval '7 days');
$$;

revoke all on function register_push_token (text, text) from public;
revoke all on function unregister_push_token (text) from public;
revoke all on function claim_push_batch (integer) from public;
revoke all on function mark_push_sent (bigint[]) from public;
revoke all on function mark_push_failed (bigint[], text) from public;
revoke all on function drop_push_tokens (text[]) from public;
revoke all on function prune_notification_outbox () from public;

grant execute on function register_push_token (text, text) to authenticated;
grant execute on function unregister_push_token (text) to authenticated;
grant execute on function claim_push_batch (integer) to service_role;
grant execute on function mark_push_sent (bigint[]) to service_role;
grant execute on function mark_push_failed (bigint[], text) to service_role;
grant execute on function drop_push_tokens (text[]) to service_role;
grant execute on function prune_notification_outbox () to service_role;
