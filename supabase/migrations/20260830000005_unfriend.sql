-- Removing a friend.
--
-- The person who was removed is told by email and deliberately not by push: a
-- notification on their lock screen is how the app announces someone being out,
-- and losing a friend should not look like that. The email is queued inside the
-- same transaction as the delete, by a trigger rather than by the client, so the
-- removed person's address never has to be handed to the app.

create table email_outbox (
  id bigint generated always as identity primary key,
  recipient_email text not null,
  subject text not null,
  body_html text not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text
);

create index email_outbox_pending_idx on email_outbox (created_at) where sent_at is null;

-- Like notification_outbox: no policies, so only the service role reaches it.
alter table email_outbox enable row level security;

create or replace function enqueue_unfriend_email () returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_id uuid;
  removed_email text;
  actor_name text;
begin
  -- Only a person removing a friend sends this mail. A cascade from a deleted
  -- account, or any other server-side cleanup, runs without auth.uid().
  if auth.uid() is null or old.status <> 'accepted' then
    return old;
  end if;

  removed_id := case when old.requester_id = auth.uid() then old.addressee_id else old.requester_id end;
  if removed_id = auth.uid() then
    return old;
  end if;

  select email into removed_email from profiles where id = removed_id;
  select display_name into actor_name from profiles where id = auth.uid();

  if removed_email is null then
    return old;
  end if;

  insert into email_outbox (recipient_email, subject, body_html)
  values (
    removed_email,
    actor_name || ' removed you on At The Bar',
    '<p>' || actor_name || ' removed you as a friend on At The Bar.</p>'
      || '<p>You will no longer see when they are at a bar, and they will no longer see when you are.</p>'
  );

  return old;
end;
$$;

create trigger friendships_removed
after delete on friendships
for each row
execute function enqueue_unfriend_email ();

-- Drops the friendship in either direction, whoever sent the original request.
create or replace function remove_friend (p_friend_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  delete from friendships f
  where (f.requester_id = auth.uid() and f.addressee_id = p_friend_id)
    or (f.requester_id = p_friend_id and f.addressee_id = auth.uid());

  get diagnostics removed = row_count;

  if removed = 0 then
    raise exception 'no friendship with %', p_friend_id;
  end if;
end;
$$;

create or replace function claim_email_batch (p_limit integer default 50) returns setof email_outbox
language sql
security definer
set search_path = public
as $$
  update email_outbox o
  set claimed_at = now(), attempts = o.attempts + 1
  where o.id in (
    select candidate.id
    from email_outbox candidate
    where candidate.sent_at is null
      and candidate.attempts < 5
      and (candidate.claimed_at is null or candidate.claimed_at < now() - interval '5 minutes')
    order by candidate.created_at
    limit greatest(p_limit, 1)
    for update skip locked
  )
  returning o.*;
$$;

create or replace function mark_email_sent (p_ids bigint[]) returns void
language sql
security definer
set search_path = public
as $$
  update email_outbox set sent_at = now(), last_error = null where id = any (p_ids);
$$;

create or replace function mark_email_failed (p_ids bigint[], p_error text) returns void
language sql
security definer
set search_path = public
as $$
  update email_outbox set claimed_at = null, last_error = p_error where id = any (p_ids);
$$;

create or replace function prune_email_outbox () returns void
language sql
security definer
set search_path = public
as $$
  delete from email_outbox
  where (sent_at is not null and sent_at < now() - interval '7 days')
    or (sent_at is null and attempts >= 5 and created_at < now() - interval '7 days');
$$;

-- anon and authenticated hold a default execute grant on every new function, so
-- the sender's queue functions have to be revoked from them by name.
revoke all on function remove_friend (uuid) from public, anon, authenticated;
revoke all on function claim_email_batch (integer) from public, anon, authenticated;
revoke all on function mark_email_sent (bigint[]) from public, anon, authenticated;
revoke all on function mark_email_failed (bigint[], text) from public, anon, authenticated;
revoke all on function prune_email_outbox () from public, anon, authenticated;

grant execute on function remove_friend (uuid) to authenticated;
grant execute on function claim_email_batch (integer) to service_role;
grant execute on function mark_email_sent (bigint[]) to service_role;
grant execute on function mark_email_failed (bigint[], text) to service_role;
grant execute on function prune_email_outbox () to service_role;
