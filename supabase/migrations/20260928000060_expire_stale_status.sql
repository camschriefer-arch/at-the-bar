-- End a visit nobody's phone ever ended.
--
-- A status is only cleared when the visitor's own device notices it has left
-- the venue. A device that is asleep, out of battery or has had its background
-- task killed never notices, so the visit stands: friends open the app the next
-- morning and someone is still at last night's bar.
--
-- Two halves. Reads stop trusting a status older than the cutoff, so a stale
-- row is never shown even before anything has cleaned it up, and
-- expire_stale_status() clears those rows for real, closing the visit so the
-- history does not keep counting.

create or replace function stale_status_cutoff () returns interval
language sql
immutable
as $$
  select interval '12 hours';
$$;

/**
 * Clears every status left standing past the cutoff and closes the visit that
 * went with it. The visit is closed at its arrival, the same as any other visit
 * whose end was never observed: we would rather record no duration than invent
 * one out of when the row happened to be swept.
 */
create or replace function expire_stale_status () returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  expired integer;
begin
  -- Nobody wants "Dean has left the bar" at nine the next morning: this
  -- departure is an admission the app stopped knowing, not an observation.
  perform set_config('app.expiring_status', 'on', true);

  with stale as (
    select user_id, arrived_at
    from user_status
    where bar_id is not null
      and arrived_at < now() - stale_status_cutoff()
  ),
  closed as (
    update check_ins c
    set departed_at = c.arrived_at
    from stale s
    where c.user_id = s.user_id and c.departed_at is null
    returning c.user_id
  ),
  cleared as (
    update user_status u
    set bar_id = null, arrived_at = null, updated_at = now()
    from stale s
    where u.user_id = s.user_id
    returning u.user_id
  )
  select count(*) into expired from cleared;

  perform set_config('app.expiring_status', 'off', true);
  return expired;
end;
$$;

-- The trigger fires on the expiry update as well, and there is no push worth
-- sending for it.
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
  if coalesce(current_setting('app.expiring_status', true), 'off') = 'on' then
    return new;
  end if;

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

-- Friends' presence: a status past the cutoff reads as nowhere, whether or not
-- it has been swept yet.
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
  left join user_status s
    on s.user_id = p.id
    and not is_shushed(p.id, auth.uid())
    and s.arrived_at > now() - stale_status_cutoff()
  left join bars b on b.id = s.bar_id
  where f.status = 'accepted'
    and auth.uid() in (f.requester_id, f.addressee_id)
  order by (b.id is null), s.arrived_at desc nulls last, p.display_name;
$$;

-- Nor can a friend who has only gone stale be named as someone you are with.
create or replace function friends_at_bar (p_bar_id uuid) returns table (
  id uuid,
  display_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar_url
  from user_status s
  join profiles p on p.id = s.user_id
  where auth.uid() is not null
    and s.bar_id = p_bar_id
    and s.arrived_at > now() - stale_status_cutoff()
    and p.id <> auth.uid()
    and are_friends(auth.uid(), p.id)
    and not is_blocked(p.id)
    and not is_shushed(auth.uid(), p.id)
  order by p.display_name;
$$;

revoke all on function stale_status_cutoff () from public;
revoke all on function expire_stale_status () from public;
grant execute on function expire_stale_status () to authenticated;
