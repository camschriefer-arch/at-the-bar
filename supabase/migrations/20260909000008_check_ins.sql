-- Visit history, so a profile can show the bars someone actually goes to.
--
-- This is the first location fact the app keeps beyond "right now": one row per
-- confirmed check-in, holding a venue id and a timestamp. It is still only ever
-- a venue the user explicitly confirmed, never a coordinate.

create table check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  bar_id uuid not null references bars (id) on delete cascade,
  arrived_at timestamptz not null default now()
);

create index check_ins_user_idx on check_ins (user_id, arrived_at desc);

alter table check_ins enable row level security;

-- Same audience as the live status: yourself, and friends you accepted.
create policy check_ins_select on check_ins for select to authenticated
  using (user_id = auth.uid() or are_friends(auth.uid(), user_id));

create policy check_ins_delete on check_ins for delete to authenticated
  using (user_id = auth.uid());

-- Whatever people are already checked into counts as their first visit, rather
-- than the history starting empty for everyone who is out tonight.
insert into check_ins (user_id, bar_id, arrived_at)
select user_id, bar_id, arrived_at from user_status where bar_id is not null;

-- set_current_bar() gains a history write. Only a move to a *different* bar
-- records a visit, so re-confirming the same place, or the client refreshing
-- its status, does not inflate the count.
create or replace function set_current_bar (p_bar_id uuid) returns user_status
language plpgsql
security definer
set search_path = public
as $$
declare
  previous uuid;
  result user_status;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_bar_id is not null and not exists (select 1 from bars where id = p_bar_id) then
    raise exception 'unknown bar %', p_bar_id;
  end if;

  select bar_id into previous from user_status where user_id = auth.uid();

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

  if p_bar_id is not null and previous is distinct from p_bar_id then
    insert into check_ins (user_id, bar_id, arrived_at)
    values (auth.uid(), p_bar_id, result.arrived_at);
  end if;

  return result;
end;
$$;

-- The bars a user goes to most. Readable for yourself and for accepted friends;
-- anyone else gets an empty list rather than an error, matching how the rest of
-- the app hides non-friends.
create or replace function top_bars (p_user_id uuid, p_limit integer default 5)
returns table (
  bar_id uuid,
  bar_name text,
  bar_city text,
  bar_state text,
  visits bigint,
  last_visit timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id,
    b.name,
    b.city,
    b.state,
    count(*),
    max(c.arrived_at)
  from check_ins c
  join bars b on b.id = c.bar_id
  where c.user_id = p_user_id
    and (p_user_id = auth.uid() or are_friends(auth.uid(), p_user_id))
  group by b.id, b.name, b.city, b.state
  order by count(*) desc, max(c.arrived_at) desc
  limit least(greatest(p_limit, 1), 25);
$$;

-- Lets someone drop a place from their own history: the whole feature is public
-- to friends, so it needs to be forgettable.
create or replace function forget_bar (p_bar_id uuid) returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from check_ins where user_id = auth.uid() and bar_id = p_bar_id;
$$;

revoke all on function top_bars (uuid, integer) from public;
revoke all on function forget_bar (uuid) from public;

grant execute on function top_bars (uuid, integer) to authenticated;
grant execute on function forget_bar (uuid) to authenticated;
