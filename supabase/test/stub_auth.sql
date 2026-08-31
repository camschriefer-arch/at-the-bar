-- Minimal stand-ins for the pieces of Supabase's auth schema the migrations
-- touch, so the migrations can be applied against a plain Postgres instance.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid () returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin
  create role authenticated;
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create role service_role;
exception
  when duplicate_object then null;
end $$;
