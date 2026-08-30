-- Row level security and the RPCs the mobile client is allowed to call.

alter table profiles enable row level security;
alter table bars enable row level security;
alter table friendships enable row level security;
alter table invites enable row level security;
alter table user_status enable row level security;

create or replace function are_friends (a uuid, b uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

create or replace function has_friendship_link (a uuid, b uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from friendships f
    where f.status in ('pending', 'accepted')
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- Profiles are visible to the owner and to anyone with a pending or accepted
-- friendship link, so a friend request can render a name instead of a raw id.
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or has_friendship_link(auth.uid(), id));

create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- The bar catalog is public reference data.
create policy bars_select on bars for select to authenticated using (true);

create policy friendships_select on friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy friendships_delete on friendships for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy invites_select on invites for select to authenticated
  using (inviter_id = auth.uid());

-- A user only ever sees their own status row, plus friends who are at a bar
-- right now. Rows with a null bar_id are invisible to everyone but the owner.
create policy user_status_select on user_status for select to authenticated
  using (
    user_id = auth.uid()
    or (bar_id is not null and are_friends(auth.uid(), user_id))
  );

create or replace function handle_new_user () returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into user_status (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function handle_new_user ();

-- Records the signed-in user's current bar. Passing null clears the status.
-- arrived_at is preserved while the user stays at the same bar.
create or replace function set_current_bar (p_bar_id uuid) returns user_status
language plpgsql
security definer
set search_path = public
as $$
declare
  result user_status;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_bar_id is not null and not exists (select 1 from bars where id = p_bar_id) then
    raise exception 'unknown bar %', p_bar_id;
  end if;

  insert into user_status (user_id, bar_id, arrived_at, updated_at)
  values (auth.uid(), p_bar_id, case when p_bar_id is null then null else now() end, now())
  on conflict (user_id) do update
    set bar_id = excluded.bar_id,
      arrived_at = case
        when excluded.bar_id is null then null
        when user_status.bar_id is distinct from excluded.bar_id then now()
        else user_status.arrived_at
      end,
      updated_at = now()
  returning * into result;

  return result;
end;
$$;

-- Bars inside a coarse bounding box. The client requests a rounded tile rather
-- than its exact position, then measures distances on device.
create or replace function bars_in_bbox (
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  max_rows integer default 500
) returns table (
  id uuid,
  name text,
  street text,
  city text,
  state text,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select bars.id, bars.name, bars.street, bars.city, bars.state, bars.lat, bars.lng
  from bars
  where bars.lat between min_lat and max_lat
    and bars.lng between min_lng and max_lng
  order by bars.id
  limit least(greatest(max_rows, 1), 2000);
$$;

-- Sends a friend request by email. If nobody owns that email yet, an invite row
-- is created instead and the token is returned so it can be emailed.
create or replace function invite_by_email (p_email text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target profiles;
  existing friendships;
  new_invite invites;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into target from profiles where lower(email) = lower(p_email);

  if target.id is null then
    insert into invites (inviter_id, email)
    values (auth.uid(), lower(p_email))
    on conflict (inviter_id, lower(email)) where status = 'pending'
    do update set created_at = now()
    returning * into new_invite;

    return jsonb_build_object('kind', 'invite', 'token', new_invite.token, 'email', new_invite.email);
  end if;

  if target.id = auth.uid() then
    raise exception 'cannot invite yourself';
  end if;

  select * into existing
  from friendships f
  where (f.requester_id = auth.uid() and f.addressee_id = target.id)
    or (f.requester_id = target.id and f.addressee_id = auth.uid());

  if existing.id is not null then
    return jsonb_build_object('kind', 'friendship', 'status', existing.status, 'friendship_id', existing.id);
  end if;

  insert into friendships (requester_id, addressee_id)
  values (auth.uid(), target.id)
  returning * into existing;

  return jsonb_build_object('kind', 'friendship', 'status', existing.status, 'friendship_id', existing.id);
end;
$$;

create or replace function respond_to_friend_request (p_friendship_id uuid, p_accept boolean) returns friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  result friendships;
begin
  update friendships
  set status = case when p_accept then 'accepted'::friendship_status else 'declined'::friendship_status end,
    responded_at = now()
  where id = p_friendship_id
    and addressee_id = auth.uid()
    and status = 'pending'
  returning * into result;

  if result.id is null then
    raise exception 'no pending friend request %', p_friendship_id;
  end if;

  return result;
end;
$$;

-- Redeems an invite token, creating an already-accepted friendship.
create or replace function accept_invite (p_token text) returns friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invites;
  result friendships;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into inv from invites where token = p_token and status = 'pending';

  if inv.id is null then
    raise exception 'invalid invite';
  end if;

  if inv.expires_at < now() then
    update invites set status = 'expired' where id = inv.id;
    raise exception 'invite expired';
  end if;

  if inv.inviter_id = auth.uid() then
    raise exception 'cannot accept your own invite';
  end if;

  insert into friendships (requester_id, addressee_id, status, responded_at)
  values (inv.inviter_id, auth.uid(), 'accepted', now())
  on conflict (requester_id, addressee_id) do update
    set status = 'accepted', responded_at = now()
  returning * into result;

  update invites set status = 'accepted', accepted_by = auth.uid() where id = inv.id;

  return result;
end;
$$;

-- The friends list: one row per accepted friend, with their bar when they have
-- one. Friends who are not at a bar come back with null bar fields.
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
  left join user_status s on s.user_id = p.id
  left join bars b on b.id = s.bar_id
  where f.status = 'accepted'
    and auth.uid() in (f.requester_id, f.addressee_id)
  order by (b.id is null), s.arrived_at desc nulls last, p.display_name;
$$;

revoke all on function bars_in_bbox (double precision, double precision, double precision, double precision, integer) from public;
revoke all on function set_current_bar (uuid) from public;
revoke all on function invite_by_email (text) from public;
revoke all on function respond_to_friend_request (uuid, boolean) from public;
revoke all on function accept_invite (text) from public;
revoke all on function friend_feed () from public;

grant execute on function bars_in_bbox (double precision, double precision, double precision, double precision, integer) to authenticated;
grant execute on function set_current_bar (uuid) to authenticated;
grant execute on function invite_by_email (text) to authenticated;
grant execute on function respond_to_friend_request (uuid, boolean) to authenticated;
grant execute on function accept_invite (text) to authenticated;
grant execute on function friend_feed () to authenticated;
