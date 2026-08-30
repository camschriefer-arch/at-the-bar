# At The Bar

iOS + Android app that shows which of your friends are out at a bar right now, and nothing else about where they are.

- Sign up with email, add friends by email invite, accept requests.
- The phone checks whether you are within **0.1 miles** of a bar. If you are, your status becomes _At the bar_ with the bar's name.
- Friends who accepted your request see that status and, on your profile, a map pin on the bar.
- When you are not at a bar, friends see nothing at all.

## Privacy model

Your coordinates never leave your device. The app downloads the bars for a coarse ~3 mile tile around you, measures distances locally, and writes only a bar id to the server (`set_current_bar`). The database has no column anywhere that can hold a user's raw position.

`user_status` rows are readable by the owner and, only when `bar_id is not null`, by accepted friends. Leaving a bar deletes the association rather than recording a departure location.

## Stack

| Piece | Choice |
| --- | --- |
| App | Expo SDK 57 (React Native), expo-router |
| Location | `expo-location` foreground + background updates, `expo-task-manager` |
| Maps | `react-native-maps` (Apple Maps on iOS, Google Maps on Android) |
| Backend | Supabase: Postgres + PostGIS, auth, row level security |
| Bar catalog | OpenStreetMap `amenity=bar|pub`, imported per state |

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

3. Load the bar catalog (Overpass is rate limited, so start with a couple of states):

   ```sh
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run import-bars -- --states TX,NY
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run import-bars   # all 50 states + DC
   ```

4. Run it. Background location needs a development build, not Expo Go:

   ```sh
   npx expo run:android      # or: npx expo run:ios (requires macOS)
   ```

   Maps use Google on both platforms, so the keys must be in the environment before the native build — `app.config.js` injects them into `ios.config.googleMapsApiKey` and `android.config.googleMaps.apiKey`. A Google key can carry only one application restriction, so create two: an iOS key restricted to bundle id `com.atthebar.app` (Maps SDK for iOS) and an Android key restricted to package `com.atthebar.app` plus your signing SHA-1 (Maps SDK for Android). For debug builds, add the debug keystore's fingerprint too:

   ```sh
   keytool -list -v -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android | grep SHA1
   ```

## Invite emails

`invite_by_email` returns a token; the app shares an `atthebar://invite?token=…` link through the OS share sheet. To send real email instead, deploy the optional edge function and give it a Resend key:

```sh
supabase secrets set RESEND_API_KEY=... INVITE_FROM_EMAIL='At The Bar <invites@yourdomain>' APP_INVITE_BASE_URL=https://yourdomain/invite
supabase functions deploy send-invite
```

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

- Push notifications when a friend arrives at a bar.
- Blocking, and per-friend visibility controls.
- App Store / Play Store submission (needs your developer accounts and an EAS project).
