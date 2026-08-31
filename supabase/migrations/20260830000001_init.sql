-- At The Bar: core schema.
--
-- Privacy model: the only location fact ever persisted about a user is which
-- bar they are currently at. Raw coordinates never leave the device; the client
-- resolves the nearest bar locally and writes only a bar id.

create extension if not exists postgis;

create type friendship_status as enum ('pending', 'accepted', 'declined', 'blocked');
create type invite_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_key on profiles (lower(email));

create table bars (
  id uuid primary key default gen_random_uuid(),
  osm_type text not null,
  osm_id bigint not null,
  name text not null,
  street text,
  city text,
  state text,
  postcode text,
  lat double precision not null,
  lng double precision not null,
  location geography (point, 4326) not null,
  updated_at timestamptz not null default now(),
  unique (osm_type, osm_id)
);

create index bars_location_idx on bars using gist (location);

create table friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles (id) on delete cascade,
  addressee_id uuid not null references profiles (id) on delete cascade,
  status friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_no_self check (requester_id <> addressee_id),
  constraint friendships_unique_pair unique (requester_id, addressee_id)
);

create index friendships_addressee_idx on friendships (addressee_id, status);
create index friendships_requester_idx on friendships (requester_id, status);

-- Email invites for people who do not have an account yet.
create table invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references profiles (id) on delete cascade,
  email text not null,
  -- Two uuid4s, hyphens stripped: 244 bits of randomness from a built-in, so the
  -- token does not depend on where a given install happens to put pgcrypto.
  token text not null unique default (
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  ),
  status invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  accepted_by uuid references profiles (id) on delete set null
);

create unique index invites_pending_key on invites (inviter_id, lower(email))
  where status = 'pending';

-- Exactly one row per user. bar_id is null when the user is not at a bar, and
-- there is deliberately no column that could hold a non-bar location.
create table user_status (
  user_id uuid primary key references profiles (id) on delete cascade,
  bar_id uuid references bars (id) on delete set null,
  arrived_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint user_status_arrived_with_bar check (
    (bar_id is null and arrived_at is null) or (bar_id is not null and arrived_at is not null)
  )
);

create index user_status_bar_idx on user_status (bar_id) where bar_id is not null;
