-- How long a visit lasted, not just that it happened.
--
-- check_ins already records an arrival per confirmed venue. Closing that row
-- when the user moves on gives a duration without keeping any new location
-- fact: it is still only a venue id and two timestamps.

alter table check_ins add column if not exists departed_at timestamptz;

-- At most one visit is open per user, and that is the row every write touches.
create index check_ins_open_idx on check_ins (user_id) where departed_at is null;

-- A visit cannot end before it began.
alter table check_ins add constraint check_ins_departed_after_arrived
  check (departed_at is null or departed_at >= arrived_at);

-- Whoever is checked in right now has an open visit; everything older is
-- closed at its arrival, since we never observed how long those lasted and
-- would rather report nothing than a guess.
update check_ins c
set departed_at = c.arrived_at
where c.departed_at is null
  and not exists (
    select 1 from user_status s
    where s.user_id = c.user_id
      and s.bar_id = c.bar_id
      and s.arrived_at = c.arrived_at
  );

-- set_current_bar() now closes the visit it is leaving. Re-confirming the same
-- bar still leaves the open row alone, so a client refresh cannot chop one
-- visit into several.
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

  if previous is distinct from p_bar_id then
    update check_ins
    set departed_at = now()
    where user_id = auth.uid() and departed_at is null;
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

  if p_bar_id is not null and previous is distinct from p_bar_id then
    insert into check_ins (user_id, bar_id, arrived_at)
    values (auth.uid(), p_bar_id, result.arrived_at);
  end if;

  return result;
end;
$$;

-- top_bars() gains the time spent. An open visit counts up to now, and visits
-- we never saw end contribute nothing rather than a zero that would drag an
-- average down. The row type changes, so the old function has to go first.
drop function if exists top_bars (uuid, integer);

create function top_bars (p_user_id uuid, p_limit integer default 5)
returns table (
  bar_id uuid,
  bar_name text,
  bar_city text,
  bar_state text,
  visits bigint,
  last_visit timestamptz,
  total_minutes integer,
  median_minutes integer
)
language sql
stable
security definer
set search_path = public
as $$
  with visits as (
    select c.bar_id,
      c.arrived_at,
      case
        when c.departed_at is null then extract(epoch from now() - c.arrived_at) / 60
        when c.departed_at > c.arrived_at then extract(epoch from c.departed_at - c.arrived_at) / 60
      end as minutes
    from check_ins c
    where c.user_id = p_user_id
      and (p_user_id = auth.uid() or are_friends(auth.uid(), p_user_id))
  )
  select b.id,
    b.name,
    b.city,
    b.state,
    count(*),
    max(v.arrived_at),
    round(coalesce(sum(v.minutes), 0))::integer,
    round(percentile_cont(0.5) within group (order by v.minutes))::integer
  from visits v
  join bars b on b.id = v.bar_id
  group by b.id, b.name, b.city, b.state
  order by count(*) desc, max(v.arrived_at) desc
  limit least(greatest(p_limit, 1), 25);
$$;

-- The visits themselves, newest first, for anyone who wants the timestamps
-- rather than the totals. Same audience as the rest of the history.
create or replace function visit_history (p_user_id uuid, p_limit integer default 50)
returns table (
  id uuid,
  bar_id uuid,
  bar_name text,
  arrived_at timestamptz,
  departed_at timestamptz,
  minutes integer
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
    b.id,
    b.name,
    c.arrived_at,
    c.departed_at,
    case
      when c.departed_at is null then round(extract(epoch from now() - c.arrived_at) / 60)::integer
      else round(extract(epoch from c.departed_at - c.arrived_at) / 60)::integer
    end
  from check_ins c
  join bars b on b.id = c.bar_id
  where c.user_id = p_user_id
    and (p_user_id = auth.uid() or are_friends(auth.uid(), p_user_id))
  order by c.arrived_at desc
  limit least(greatest(p_limit, 1), 200);
$$;

revoke all on function top_bars (uuid, integer) from public;
revoke all on function visit_history (uuid, integer) from public;

grant execute on function top_bars (uuid, integer) to authenticated;
grant execute on function visit_history (uuid, integer) to authenticated;
