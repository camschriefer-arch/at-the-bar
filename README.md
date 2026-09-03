# At The Bar

iOS + Android app that shows which of your friends are out at a bar right now, and nothing else about where they are.

- Sign up with email, add friends by email invite or a shareable invite link, accept requests.
- The phone checks whether you are within **0.03 miles** of a bar, pub or restaurant. Stay there **3 minutes** and it asks "Are you at Jake & Joe's?" — a yes sets your status to _At the bar_, and nothing else does. With several venues in range you get one notification instead of one each, and pick which one you are at in the app. Passing a venue, or working above one, never checks you in. "Check in now" asks straight away.
- Leaving is automatic: walk away and the status clears itself.
- Friends who accepted your request see that status and, on your profile, a map pin on the bar.
- Friends get a push notification when you arrive at or leave a bar ("Bob is at the bar"), naming you but not the bar.
- Removing a friend cuts the tie both ways; they get an email about it, never a push.
- Your profile carries a photo of you and a gallery of the drinks you post (bar, drink, note, 1–5 stars), which accepted friends browse from your friend screen.
- When you are not at a bar, friends see nothing at all.

## Privacy model

Your coordinates never leave your device. The app downloads the venues for a coarse ~1.5 mile tile around you, measures distances locally, and writes only a bar id to the server (`set_current_bar`). The database has no column anywhere that can hold a user's raw position.

`user_status` rows are readable by the owner and, only when `bar_id is not null`, by accepted friends. Leaving a bar deletes the association rather than recording a departure location.

## Stack

| Piece | Choice |
| --- | --- |
| App | Expo SDK 57 (React Native), expo-router |
| Location | `expo-location` foreground + background updates, `expo-task-manager` |
| Maps | `react-native-maps` with Google Maps on both platforms |
| Backend | Supabase: Postgres + PostGIS, auth, row level security |
| Venue catalog | OpenStreetMap `amenity=bar|pub|restaurant`, imported per state |
| Push | `expo-notifications` + Expo Push Service, fanned out by the `send-push` edge function |
| Photos | `expo-image-picker` + private Supabase Storage buckets, rendered from signed URLs with `expo-image` |

## Setup

1. Create a Supabase project, then apply the migrations:

   ```sh
   supabase link --project-ref <ref>
   supabase db push
   ```

   `supabase/migrations/20260830000001_init.sql` creates the schema; `..._policies.sql` adds RLS and the RPCs the client calls.

2. Configure the app:

   ```sh
   cp .env.example .env   # fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
   npm install
   ```

3. Load the venue catalog (Overpass is rate limited, so start with a couple of states):

   ```sh
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run import-bars -- --states TX,NY
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run import-bars   # all 50 states + DC
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run import-bars -- --categories restaurant
   ```

   The import is idempotent (keyed on the OSM id), so re-running it only refreshes rows.

   Production keeps itself current: [`.github/workflows/refresh-venues.yml`](.github/workflows/refresh-venues.yml) re-imports every state at 04:00 UTC on the 1st of each month, in chunks so no job runs for hours. It needs the repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and can be run by hand (optionally for a few states) from the Actions tab.

4. Run it. Background location needs a development build, not Expo Go:

   ```sh
   npx expo run:android      # or: npx expo run:ios (requires macOS)
   ```

   iOS renders with Apple Maps and needs no key. Android uses Google, so `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID` must be in the environment before the native build — `app.config.js` injects it into `android.config.googleMaps.apiKey`. Restrict that key (Maps SDK for Android) to package `com.atthebar.app` plus your signing SHA-1. For debug builds, add the debug keystore's fingerprint too:

   ```sh
   keytool -list -v -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android | grep SHA1
   ```

## Push notifications

A trigger on `user_status` queues one `notification_outbox` row per accepted friend whenever a user's `bar_id` goes from null to a bar ("arrived") or back ("left"); moving between two bars queues nothing, since the status is unchanged. The body names the person only — the bar is revealed when the friend taps through and passes the same RLS checks as the friends list.

The `send-push` function drains that queue through the Expo Push Service. It claims rows rather than deleting them, so a failed send retries and a check-in is never lost or duplicated.

```sh
eas init                        # push tokens need an EAS project id
eas credentials                 # upload the APNs key / FCM v1 service account
supabase functions deploy send-push
```

The app invokes `send-push` right after a check-in so delivery is immediate. Add a sweep so nothing is stranded if that request dies with the app:

```sql
select cron.schedule('send-push', '* * * * *', $$
  select net.http_post(
    url := 'https://<ref>.functions.supabase.co/send-push',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
  );
$$);
```

## Photos

Profile pictures live in the `avatars` bucket and drink photos in `drinks`, both private. Objects are stored as `<user id>/<timestamp>.<ext>`, and the storage policies read that prefix: you may write only under your own id, and an object is readable by its owner and their accepted friends — the same rule as `drink_posts` rows. The client never holds a public URL; it mints a one-hour signed URL per image.

`drink_posts` keeps a snapshot of the bar name alongside the optional `bar_id`, because the catalog is reimported from OpenStreetMap and a bar can vanish from it while the photo should not. Ratings are constrained to 1–5 in the database.

The bar field autocompletes against the catalog: bars from the cached tile around the device rank first (closest first, with the distance shown), then name matches from anywhere in the country, and a name that has no catalog entry can still be typed in freely. Only the typed text is sent for the country-wide search — the device's position never leaves it.

The buckets and their policies are created by `supabase/migrations/20260830000004_photos.sql`, which skips the storage half when the `storage` schema is absent so the migration still applies to a plain Postgres in tests.

## Removing a friend

`remove_friend` deletes the friendship whichever direction it was made in, so both people immediately lose the other's status and drink photos. A trigger on the delete queues one `email_outbox` row for the person who was removed, inside the same transaction — the client is never handed their address, and nothing is queued when the row disappears through a cascade instead of a person.

The notice is email on purpose: a push is how the app says someone is out, and being dropped should not arrive that way.

## Emails

`invite_by_email` and `create_invite_link` both return a token; the app turns it into an `atthebar:///redeem?token=…` link to copy or share. A link invite has no email attached, so anyone who opens it becomes a friend, and each user has one live link at a time. To send real email instead, deploy the edge functions and give them a Resend key:

```sh
supabase secrets set RESEND_API_KEY=... INVITE_FROM_EMAIL='At The Bar <invites@yourdomain>' APP_INVITE_BASE_URL=https://yourdomain/redeem
supabase functions deploy send-invite   # invite links, called with the sender's token
supabase functions deploy send-email    # drains email_outbox with the service role
```

`send-email` claims rows the same way `send-push` does, so a provider outage retries instead of losing the notice. The app pokes it right after a removal; schedule the same sweep as the push queue so a dropped request still goes out:

```sql
select cron.schedule('send-email', '* * * * *', $$
  select net.http_post(
    url := 'https://<ref>.functions.supabase.co/send-email',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
  );
$$);
```

## Shipping to a phone

`eas.json` defines two profiles: `preview` (internal distribution — an installable
`.apk` on Android, an ad hoc `.ipa` on iOS) and `production` (`.aab` / App Store
build, used for TestFlight). Both read their `EXPO_PUBLIC_*` values from EAS
environment variables rather than a committed `.env`, so set them once per
environment:

```sh
eas env:set --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co \
  --environment production --visibility plaintext
# ...same for EXPO_PUBLIC_SUPABASE_ANON_KEY and the two Google Maps keys
```

An iPhone build needs a paid Apple Developer account either way; TestFlight is the
least fiddly route because it skips per-device UDID registration:

```sh
eas init
eas build --platform ios --profile production --auto-submit
```

Android release builds are signed by a different key than the debug one, so add the
release SHA-1 (`eas credentials`) to the Android Maps key or the map goes grey. iOS
needs nothing here — Apple Maps is keyless.

## Checks

```sh
npm run lint
npm run typecheck
npm test              # geo/radius math
```

The database rules have their own smoke test, which runs the migrations against a scratch Postgres and asserts that a stranger cannot see a friend's bar:

```sh
docker run -d --name atb-pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgis/postgis:16-3.4
docker exec -i atb-pg psql -U postgres -v ON_ERROR_STOP=1 < supabase/test/stub_auth.sql
for f in supabase/migrations/*.sql; do docker exec -i atb-pg psql -U postgres -v ON_ERROR_STOP=1 -q < "$f"; done
docker exec -i atb-pg psql -U postgres -v ON_ERROR_STOP=1 < supabase/test/smoke.sql
```

## Not done yet

- Blocking, and per-friend visibility controls.
- App Store / Play Store submission (needs your developer accounts and an EAS project).
