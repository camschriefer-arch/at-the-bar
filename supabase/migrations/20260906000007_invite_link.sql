-- An invite you can hand out without knowing anyone's email: the same token
-- machinery as invite_by_email(), just with no address attached.
alter table invites alter column email drop not null;

-- One live link per user, so the code on the Invite tab stays the same until it
-- is redeemed or expires.
create unique index invites_pending_link_key on invites (inviter_id)
  where status = 'pending' and email is null;

create or replace function create_invite_link () returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  link invites;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update invites set status = 'expired'
  where inviter_id = auth.uid()
    and email is null
    and status = 'pending'
    and expires_at <= now();

  select * into link
  from invites
  where inviter_id = auth.uid() and email is null and status = 'pending';

  if link.id is null then
    insert into invites (inviter_id) values (auth.uid())
    returning * into link;
  end if;

  return jsonb_build_object('token', link.token, 'expires_at', link.expires_at);
end;
$$;

revoke all on function create_invite_link () from public, anon;

grant execute on function create_invite_link () to authenticated;
