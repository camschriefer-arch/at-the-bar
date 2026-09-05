-- Muting a friend silences their arrive/leave pushes without ending the
-- friendship: their status is still there when the app is opened, it just stops
-- interrupting. Muting is private to the person who did it, so nothing tells the
-- muted friend about it.

create table notification_mutes (
  muter_id uuid not null references profiles (id) on delete cascade,
  muted_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

alter table notification_mutes enable row level security;

create policy notification_mutes_select on notification_mutes for select to authenticated
  using (muter_id = auth.uid());

create policy notification_mutes_insert on notification_mutes for insert to authenticated
  with check (muter_id = auth.uid());

create policy notification_mutes_delete on notification_mutes for delete to authenticated
  using (muter_id = auth.uid());

-- Unchanged except for the mute check: recipients who muted the actor are left
-- out of the batch entirely rather than filtered at send time, so a mute that
-- lands mid-visit also silences the matching "has left" notification.
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
    and not exists (
      select 1
      from notification_mutes m
      where m.muter_id = recipient.id and m.muted_id = new.user_id
    );

  return new;
end;
$$;
