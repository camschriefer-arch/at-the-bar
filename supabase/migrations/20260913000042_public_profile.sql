-- A name and a picture is all anyone outside your friends ever sees of you:
-- no status, no bar, no photos, no email.
create or replace function public_profile (p_user_id uuid) returns table (
  id uuid,
  display_name text,
  avatar_url text,
  friend_state text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
    p.display_name,
    p.avatar_url,
    case
      when p.id = auth.uid() then 'self'
      when exists (
        select 1 from friendships f
        where f.status = 'accepted'
          and ((f.requester_id = auth.uid() and f.addressee_id = p.id)
            or (f.requester_id = p.id and f.addressee_id = auth.uid()))
      ) then 'friends'
      when exists (
        select 1 from friendships f
        where f.status = 'pending' and f.requester_id = auth.uid() and f.addressee_id = p.id
      ) then 'requested'
      when exists (
        select 1 from friendships f
        where f.status = 'pending' and f.requester_id = p.id and f.addressee_id = auth.uid()
      ) then 'incoming'
      else 'none'
    end
  from profiles p
  where p.id = p_user_id and auth.uid() is not null;
$$;

-- The friendship id the viewer needs to accept an incoming request, so the
-- limited profile can offer Accept without exposing the rest of the table.
create or replace function incoming_request_from (p_user_id uuid) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select f.id
  from friendships f
  where f.status = 'pending' and f.requester_id = p_user_id and f.addressee_id = auth.uid();
$$;

-- Asks someone to be friends directly, rather than by email, and tells them.
-- Repeat calls are a no-op that report the state the pair is already in.
create or replace function request_friend (p_user_id uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing friendships;
  actor_name text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'cannot add yourself';
  end if;

  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'unknown user %', p_user_id;
  end if;

  select * into existing
  from friendships f
  where (f.requester_id = auth.uid() and f.addressee_id = p_user_id)
    or (f.requester_id = p_user_id and f.addressee_id = auth.uid());

  if existing.id is not null then
    return existing.status::text;
  end if;

  insert into friendships (requester_id, addressee_id) values (auth.uid(), p_user_id);

  select display_name into actor_name from profiles where id = auth.uid();

  insert into notification_outbox (recipient_id, actor_id, event, body)
  values (
    p_user_id,
    auth.uid(),
    'requested',
    actor_name || ' wants to be your friend on At The Bar'
  );

  return 'pending';
end;
$$;

-- Profile pictures become readable to any signed-in user, because a comment
-- from someone you have not met yet still shows their face. Drink photos stay
-- friends-only.
do $$
begin
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
          )
        )
      );
  $policy$;
end
$$;
