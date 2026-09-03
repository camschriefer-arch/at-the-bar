---
name: testing-at-the-bar
description: How to bring up and end-to-end test the At The Bar Expo/Supabase app on a headless Android emulator (local Supabase, dev build, mock GPS, adb UI automation).
---

# End-to-end testing At The Bar on a headless Android emulator

This box has no usable desktop/X session, so `computer` (screenshot/click) tools do not work
for the emulator. Everything below is driven with `adb` and `uiautomator`; evidence is
`adb exec-out screencap` PNGs and `adb shell screenrecord` MP4s.

## Environment bring-up

1. `source ~/.nvm/nvm.sh && nvm use 22` (Node 20 fails React Native's engine check).
2. Local Supabase: install the Supabase CLI from the GitHub releases API (direct `.deb`
   URLs can 302 to a stub file — verify the download size). `supabase start` in the repo
   applies `supabase/migrations/*.sql` automatically. Do NOT apply
   `supabase/test/stub_auth.sql` to a real Supabase stack.
   - Host API `http://127.0.0.1:54321`, DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
   - From the emulator the API host must be `http://10.0.2.2:54321` in `.env`
     (`EXPO_PUBLIC_SUPABASE_URL`), otherwise every request fails silently-ish.
   - `psql` may not be installed on the host; use
     `docker exec supabase_db_<project> psql -U postgres -d postgres -c "..."`.
3. Seed a couple of bars directly with SQL instead of running `npm run import-bars`
   (Overpass is slow/rate-limited).
4. Emulator: `sudo -n chmod 666 /dev/kvm` may be needed. Launch headless:
   `emulator -avd <avd> -no-snapshot -no-audio -no-window -gpu swiftshader_indirect -memory 2048 -no-boot-anim`.
5. Memory is tight (~8 GB total). Gradle + emulator concurrently WILL OOM-kill the
   emulator. Build with the emulator stopped, or expect to relaunch it afterwards.
   Build with `./gradlew :app:assembleDebug -Dorg.gradle.jvmargs="-Xmx1024m" -Pandroid.injected.build.abi=x86_64 --no-daemon`.
   With `-Pandroid.injected.build.abi` the APK lands in
   `android/app/build/intermediates/apk/debug/app-debug.apk` and needs `adb install -r -t`
   (it is marked test-only).
6. `npx expo run:android` often fails with "Could not find device with name: emulator-5554"
   when the emulator was started outside Expo — build with Gradle and install manually, then
   `adb reverse tcp:8081 tcp:8081` and run `npx expo start --dev-client`.
7. `npx expo prebuild` rewrites `package.json` scripts (`expo start --android` ->
   `expo run:android`). Revert that with `git checkout package.json` before finishing.

## Driving the UI over adb

Helper pattern (`uiautomator dump` + tap the centre of a node's bounds):

```bash
adb shell uiautomator dump /sdcard/ui.xml
adb shell cat /sdcard/ui.xml   # grep text="..." / content-desc="..." / EditText bounds
adb shell input tap X Y
adb exec-out screencap -p > shot.png
```

Gotchas:
- React Native `<Button>`s expose `content-desc`, not `text` — tap by content-desc.
- The soft keyboard covers the submit button. `keyevent 111` (ESC) does not hide it;
  `keyevent 4` (BACK) does. Always dismiss the keyboard, re-dump, then tap.
- To clear a text field: tap it, `input keycombination 113 29` (Ctrl+A) then `keyevent 67`.
  Repeated `keyevent 67` alone often does nothing.
- A button rendered as a spinner (loading state) simply has no content-desc — wait and re-dump.
- The keyboard also overlays autocomplete suggestion rows while `uiautomator` still reports their
  un-obscured bounds, so a tap meant for a suggestion lands on an IME key. Dismiss with
  `keyevent 4` and re-dump before tapping a row.
- `adb shell pm clear com.atthebar.app` (the way to flush the cached bar tile in AsyncStorage) also
  revokes location permission, and a nearby-bar list of zero looks exactly like a broken feature.
  Re-grant `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` with `pm grant` afterwards.

## Faking GPS

`adb emu geo fix <lng> <lat>` returns `OK` but does NOT reach Android on this emulator image
(`dumpsys location` keeps `last location=null`). Use the LocationManager test provider instead:

```bash
adb shell appops set 2000 android:mock_location allow
adb shell cmd location providers add-test-provider gps
adb shell cmd location providers set-test-provider-enabled gps true
adb shell cmd location providers set-test-provider-location gps --location <lat>,<lng> --accuracy 5
```

expo-location (`getCurrentPositionAsync`) does pick these up. The mocked fix goes stale, so
re-issue `set-test-provider-location` in a 1 Hz loop for ~30 s while tapping "Check in now";
otherwise you get "Current location is unavailable. Make sure that location services are enabled".

## Privacy verification (the point of this app)

- Supabase local API is plain HTTP on loopback, so wire evidence is easy:
  `sudo tcpdump -i lo -A -s0 'tcp port 54321' -w cap.pcap`, then grep the bodies. Expect only
  `bars_in_bbox` with rounded tile bounds and `set_current_bar` with a bar UUID or null.
- DB check: `select table_name, column_name from information_schema.columns where table_schema='public' and column_name ~* 'lat|lng|coord|geo'` — coordinates should exist only on `bars`.

## Google Maps on the emulator

`react-native-maps` with `PROVIDER_GOOGLE` needs the key in the native manifest, which is
baked at prebuild time — changing `.env`/`app.config.js` requires a re-prebuild + rebuild.
If tiles are blank, check `adb logcat | grep "Google Maps Android API"` for
`Authorization failure`; the log prints the package + SHA-1 the key must be restricted to.
That is a key-restriction/environment issue, not an app bug.

## Push notifications / notification_outbox testing

- There is no EAS project id here, so `registerForPushNotifications()` throws
  "Missing EAS project id" after the Android POST_NOTIFICATIONS dialog is answered. The error is
  swallowed in `app/_layout.tsx`; expected symptoms are an empty `push_tokens` table and no
  logcat `FATAL EXCEPTION` / unhandled rejection. A permission dialog appearing on first launch
  after a rebuild is normal — tap "Allow" (`permission_allow_button`).
- Verify the trigger at DB level rather than via real Expo delivery:
  `select recipient_id, actor_id, event, body from notification_outbox order by id;`
  Bodies must be `<name> is at the bar` / `<name> has left the bar` with no bar name or id.
- Because RPCs such as `claim_push_batch` are `security definer`, check their ACLs, not just RLS:
  `select proname, proacl from pg_proc join pg_namespace ... where nspname='public'`.
  Supabase grants EXECUTE to `anon`/`authenticated` by default, so `revoke ... from public`
  in a migration does NOT lock a function down — the revoke must name `anon, authenticated`.
  Test by calling the RPC through PostgREST with only the anon key.

## Photos / storage (avatars + drink gallery) testing

- `expo-image-picker` is a native dep: rebuild the dev build before testing photo flows.
- Seed images into the device MediaStore first, e.g. `adb push img.jpg /sdcard/Pictures/` then
  `adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/img.jpg`.
  On API 34 the app uses the permissionless Android photo picker ("This app can only access the
  photos you select"), so `pm revoke READ_MEDIA_IMAGES` fails with "has not requested permission" —
  a true permission-denial path may not be reproducible; exercise the cancel path (BACK in the
  picker) instead, which hits the same null-photo branch.
- Selecting an image opens Expo's crop activity — tap `CROP` to return to the app.
- If an upload fails with "name resolution failed", the storage container is likely stopped:
  `docker start supabase_storage_<project>` (Kong logs show a 503 + DNS resolution failure).
- Buckets are private; verify `profiles.avatar_url` / `drink_posts.image_path` store the object
  path `<uuid>/<ts>.jpg` (not an http URL) and cross-check `storage.objects`.
- Stranger checks: with a non-friend JWT + anon key expect `[]` from `/rest/v1/drink_posts` and
  from `rpc/drink_posts_for`, `401 permission denied` for the RPC with the anon key alone, and
  404/NoSuchKey from `/storage/v1/object/sign/...`; run the same calls with the friend's JWT as a
  positive control.

## Reaching the friend-detail screen

Friends who are not at a bar are not tappable, so the friend detail screen (avatar, map,
"Their drinks") is only reachable while the friend is checked in. Sign-out clears the signed-out
user's `user_status.bar_id`, so after switching accounts the other user is no longer active.
To test friend-detail UI, re-set the other user's status with service-role SQL:
`update user_status set bar_id=(select id from bars limit 1), arrived_at=now() where user_id='<uuid>';`
(note this fires the notification trigger and enqueues an outbox row).

## Schema changes, rebuilds and clipboard/long-text input

- A branch that adds a migration does NOT need `supabase db reset` (which would wipe the bars
  catalog and the test accounts): `npx supabase migration up --local` applies only the pending
  files to the running stack and leaves data intact. Verify afterwards with `\d <table>` and
  `select proacl from pg_proc where proname='<new_rpc>'`.
- Gradle needs the SDK location explicitly when invoked outside Expo: export
  `ANDROID_HOME=$HOME/Android/Sdk` (there is no `android/local.properties`), otherwise the build
  fails with "SDK location not found". A warm incremental `:app:assembleDebug` takes ~1-2 min.
- Any newly added native/Expo module (e.g. `expo-clipboard`) needs a rebuild + `adb install -r -t`;
  autolinking picks it up at Gradle configure time, no re-`prebuild` needed.
- `adb shell input text` silently truncates long strings (~50-60 chars): type long tokens/URLs in
  chunks with a short sleep between them and re-dump the field to confirm the full value.
- To verify what an app put on the clipboard, focus a text field and send `keyevent 279`
  (KEYCODE_PASTE), then read the EditText `text=` from `uiautomator dump`. `cmd clipboard get`
  does not exist on this image.
- On the Invite screen the notice/error line renders at the very BOTTOM of the ScrollView, so
  after tapping a button near the top you must scroll down to see (and screenshot) the feedback.
- Supabase PostgrestError objects are not `instanceof Error`, so screens using
  `cause instanceof Error ? cause.message : '<generic>'` will show only the generic fallback and
  hide RPC `raise exception` messages. Confirm the real message by calling the RPC over PostgREST
  with the user's own JWT before reporting the UI text as the backend behaviour.

## Test-account and evidence gotchas

- Passwords for previously created local accounts are easy to lose; reset with the admin API:
  `curl -X PUT $API/auth/v1/admin/users/<uid> -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" -d '{"password":"..."}'`.
- The last-checked-in bar is cached per device in AsyncStorage and is NOT cleared on sign out,
  so the first "Check in now" for a newly signed-in user at the same bar can be a client-side
  no-op (UI says "At the bar" while `user_status.bar_id` stays null, and no outbox row appears).
  Tap "Go offline" once after signing in to reset the cache before testing a check-in.
- Background mock-GPS loops started with `nohup ... &` from a one-shot shell tool call get killed;
  run the 1 Hz loop in a persistent background shell session instead (and remember `adb` is at
  `~/Android/Sdk/platform-tools`, not on the default PATH of a fresh shell).
- `/dev/kvm` permissions reset across reboots — re-run `sudo -n chmod 666 /dev/kvm` if the
  emulator dies with "This user doesn't have permissions to use KVM".
- `adb shell screenrecord` only writes the mp4 moov atom when it finishes; pulling the file
  early yields "moov atom not found". Wait out `--time-limit` before `adb pull`, then join
  segments with `ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4`.

## Devin Secrets Needed

- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID` (and `_IOS`) — required only for map tile rendering.
  Supabase credentials are generated locally by `supabase start`.

## Marketing / App Store screenshots at a custom resolution

- Apple's 6.9" slot needs exactly 1290x2796 PNGs with no crop/scale. Create a dedicated AVD
  instead of resizing later:
  `avdmanager create avd -n atb69 -k "system-images;android-34;google_apis;x86_64" -d pixel_6`
  then set `hw.lcd.width=1290`, `hw.lcd.height=2796`, `hw.lcd.density=480` in
  `~/.android/avd/atb69.avd/config.ini`. Verify after boot with `adb shell wm size` /
  `adb shell wm density` — `avdmanager` output does not echo the override.
- A 1290x2796 guest is memory hungry: qemu reached ~5.2 GB RSS and was OOM-killed on a 8 GB box,
  taking the Metro process with it. Add swap first (`fallocate -l 8G /swapfile2` + `mkswap` +
  `swapon`) and boot with `-memory 3072`. After any suspected death, check
  `curl -s http://127.0.0.1:8081/status` — a red box whose stack mentions
  `loadJSBundleFromAssets` usually means Metro is gone, not an app bug; restart
  `npx expo start --dev-client` and re-run `adb reverse tcp:8081 tcp:8081`.
- High resolution also makes "System UI isn't responding" ANR dialogs more likely right after
  boot; tap "Wait" (find its bounds in a uiautomator dump) rather than rebooting.
- Clean status bar via SystemUI demo mode:
  `adb shell settings put global sysui_demo_allowed 1` then broadcasts
  `com.android.systemui.demo` with `command enter`, `clock -e hhmm 0941`,
  `battery -e level 100 -e plugged false`, `network -e wifi show -e level 4 -e mobile show ...`,
  `notifications -e visible false`, and `status -e location hide -e alarm hide ...` (mock GPS
  otherwise leaves a location icon in the bar). Demo mode is LOST when SystemUI restarts/ANRs —
  re-apply and re-capture; verify by OCR'ing the top 110 px (`tesseract`, note it reads 9:41 as
  9:47) and by diffing the status-bar strip across captures (should be pixel-identical).
- Judge image/map rendering without a display: crop the region and count unique colours
  (`collections.Counter(img.crop(box).getdata())`). Loaded photos give tens of thousands of
  colours; a blank map is a single flat colour. On this AVD Google Maps tiles DID render
  (land `#f5f3f3`, park `#c3f1d5`, water `#90daee`, red marker `#ea3535`) — earlier grey-tile
  reports were resolution/AVD specific, so always re-check before skipping a map screenshot.
- Seed plausible marketing data with the service-role key: real venue row, 2-3 accepted
  friendships (one with `set_current_bar` so they show under AT THE BAR), an avatar and 4 drink
  posts uploaded to the private `avatars` / `drinks` buckets (rendered via signed URLs, TTL 1 h).
  Use drink/bar imagery (e.g. loremflickr `beer,pint` / `cocktail,bar`), not generic placeholders,
  and force-stop + relaunch the app after reseeding — `expo-image` caches the old signed URLs.
- Screenshot copy note: the single-venue prompt reads "ARE YOU HERE?" + the bar name with
  "Yes, I'm here" / "Not here"; it never literally says "Are you at <bar>?".
