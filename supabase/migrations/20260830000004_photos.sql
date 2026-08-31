-- Profile photos and the beer gallery.

comment on column profiles.avatar_url is 'Object path in the private avatars bucket, not a URL.';

create table drink_posts (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references profiles (id) on delete cascade,
  bar_id uuid references bars (id) on delete set null,
  -- Snapshot of the bar name: the catalog is reimported from OpenStreetMap, so
  -- a bar can disappear from it while the photo of that night should not.
  bar_name text not null check (length(btrim(bar_name)) > 0),
  beer_name text not null check (length(btrim(beer_name)) > 0),
  description text,
  rating smallint not null check (rating between 1 and 5),
  image_path text not null unique,
  created_at timestamptz not null default now()
);

create index drink_posts_user_idx on drink_posts (user_id, created_at desc);

alter table drink_posts enable row level security;

-- Same audience as a status: yourself and the friends you accepted.
create policy drink_posts_select on drink_posts for select to authenticated
  using (user_id = auth.uid() or are_friends(auth.uid(), user_id));

create policy drink_posts_insert on drink_posts for insert to authenticated
  with check (user_id = auth.uid());

create policy drink_posts_update on drink_posts for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy drink_posts_delete on drink_posts for delete to authenticated
  using (user_id = auth.uid());

-- Photos of a friend's gallery, newest first. The client turns image_path into
-- a short-lived signed URL; the buckets are private.
create or replace function drink_posts_for (p_user_id uuid) returns setof drink_posts
language sql
stable
security invoker
set search_path = public
as $$
  select * from drink_posts
  where user_id = p_user_id
  order by created_at desc;
$$;

revoke all on function drink_posts_for (uuid) from public, anon, authenticated;
grant execute on function drink_posts_for (uuid) to authenticated;

-- Objects live under <owner uuid>/<file>, which is how the storage policies
-- below decide who may read them. Returns null for any other layout so a
-- malformed path fails closed instead of raising.
create or replace function storage_object_owner (object_name text) returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

-- Supabase Storage lives in the `storage` schema, which only exists in a real
-- Supabase stack; skip it on a plain Postgres used for schema tests.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
    ('drinks', 'drinks', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

  execute $policy$
    create policy photos_insert on storage.objects for insert to authenticated
      with check (
        bucket_id in ('avatars', 'drinks')
        and storage_object_owner(name) = auth.uid()
      );
  $policy$;

  -- Readable by the owner and their accepted friends only, mirroring
  -- drink_posts_select. A signed URL is minted through this policy.
  execute $policy$
    create policy photos_select on storage.objects for select to authenticated
      using (
        bucket_id in ('avatars', 'drinks')
        and (
          storage_object_owner(name) = auth.uid()
          or are_friends(auth.uid(), storage_object_owner(name))
        )
      );
  $policy$;

  execute $policy$
    create policy photos_update on storage.objects for update to authenticated
      using (bucket_id in ('avatars', 'drinks') and storage_object_owner(name) = auth.uid())
      with check (bucket_id in ('avatars', 'drinks') and storage_object_owner(name) = auth.uid());
  $policy$;

  execute $policy$
    create policy photos_delete on storage.objects for delete to authenticated
      using (bucket_id in ('avatars', 'drinks') and storage_object_owner(name) = auth.uid());
  $policy$;
end
$$;
