-- Telling the developer that something is wrong.
--
-- "Having trouble?" already works out why the app did not ask about a venue,
-- but only the person holding the phone ever sees it. This keeps that report,
-- with whatever the user says went wrong, and mails it on, so a problem a
-- friend hits in another city can be read without asking them to describe it.
--
-- What is kept is what the user was already shown: distances, dwell times,
-- verdicts and whether the background task is running. No coordinates: the
-- promise the app is built on is that where someone is stays on their phone,
-- and a bug report is not a reason to break it.

create table trouble_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  note text not null,
  -- The CheckInReport the user was looking at, if they ran one.
  report jsonb,
  app_version text,
  platform text,
  created_at timestamptz not null default now()
);

create index trouble_reports_recent_idx on trouble_reports (created_at desc);

alter table trouble_reports enable row level security;

-- A user may read what they sent and nothing else; writes go through
-- report_trouble() so the row cannot be attributed to anyone else.
create policy trouble_reports_own on trouble_reports for select
using (user_id = (select auth.uid()));

-- Who the reports are mailed to. A table rather than a constant so the
-- addresses live in the database with the data, not in a public repository,
-- and so another pair of eyes can be added without a migration.
create table support_recipients (
  email text primary key,
  added_at timestamptz not null default now()
);

alter table support_recipients enable row level security;

/**
 * Files a report and queues the mail for it. The note is required — a report
 * with nothing said about it is a row nobody can act on — and the rest is
 * whatever the app knew.
 */
create or replace function report_trouble (
  p_note text,
  p_report jsonb default null,
  p_app_version text default null,
  p_platform text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  reporter uuid := auth.uid();
  reporter_name text;
  reporter_email text;
  note text := nullif (btrim(p_note), '');
  safe_note text;
  report_id bigint;
  recipient text;
begin
  if reporter is null then
    raise exception 'not signed in';
  end if;

  if note is null then
    raise exception 'say what went wrong';
  end if;

  -- Long enough for a paragraph, short enough that nothing can be pasted into
  -- the mail at any size.
  note := left(note, 2000);
  -- The mail body is HTML, and someone describing a problem should not be able
  -- to write any of it.
  safe_note := replace(replace(replace(note, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

  insert into trouble_reports (user_id, note, report, app_version, platform)
  values (reporter, note, p_report, left(p_app_version, 40), left(p_platform, 40))
  returning id into report_id;

  select display_name, email into reporter_name, reporter_email
  from profiles
  where id = reporter;

  for recipient in select email from support_recipients loop
    insert into email_outbox (recipient_email, subject, body_html)
    values (
      recipient,
      'At The Bar trouble report from ' || coalesce(reporter_name, 'someone'),
      '<p><strong>' || coalesce(reporter_name, 'Someone') || '</strong>'
        || coalesce(' (' || reporter_email || ')', '')
        || ' reported a problem.</p>'
        || '<p>' || replace(safe_note, E'\n', '<br />') || '</p>'
        || '<p>Version ' || coalesce(p_app_version, 'unknown')
        || ' on ' || coalesce(p_platform, 'unknown') || '.</p>'
        || '<pre>' || coalesce(p_report::text, 'no diagnostics') || '</pre>'
    );
  end loop;

  return report_id;
end;
$$;

revoke all on function report_trouble (text, jsonb, text, text) from public, anon;
grant execute on function report_trouble (text, jsonb, text, text) to authenticated;
