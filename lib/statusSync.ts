import AsyncStorage from '@react-native-async-storage/async-storage';

import { barsNear } from './barCache';
import { nearestVenue, reportOnVenues, type CheckInReport } from './diagnosis';
import { type LatLng } from './geo';
import { isBackgroundUpdatesRunning } from './locationService';
import { flushPendingNotifications } from './notifications';
import { supabase } from './supabase';
import { isMoving, type Fix } from './motion';
import { noteSighting, parseSighting, stillAt, venuesToConfirm } from './venues';
import { allowVenue, clearPendingVenue, promptForVenues, quietVenues } from './venuePrompt';
import type { Bar } from './types';

const LAST_BAR_KEY = 'atb:lastBarId';
const SIGHTING_KEY = 'atb:sighting';
const FIX_KEY = 'atb:lastFix';
const TOUCH_KEY = 'atb:statusTouched';

/**
 * How often a status that has not changed is written again anyway. The server
 * expires a status it has heard nothing about (stale_status_cutoff()), so
 * saying "still here" keeps a real night out from being swept out from under
 * the user, and restores a status that was swept while the phone was asleep.
 */
const TOUCH_MS = 30 * 60 * 1000;

export type ResolvedStatus = { bar: Bar | null; changed: boolean };

/** Which of `barIds` the user has been near long enough for them to count. */
async function dwelledVenues(barIds: readonly string[]): Promise<string[]> {
  const previous = parseSighting(await AsyncStorage.getItem(SIGHTING_KEY));
  const { sighting, dwelled } = noteSighting(previous, barIds, Date.now());
  await AsyncStorage.setItem(SIGHTING_KEY, JSON.stringify(sighting));
  return dwelled;
}

/** The last fix the app was given, wherever it came from. */
async function lastFix(): Promise<Fix | null> {
  const raw = await AsyncStorage.getItem(FIX_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Fix;
  } catch {
    return null;
  }
}

/** Stores this fix and says whether the user got here by moving. */
async function noteFix(fix: Fix): Promise<boolean> {
  const previous = await lastFix();

  await AsyncStorage.setItem(FIX_KEY, JSON.stringify(fix));
  return isMoving(previous, fix);
}

async function writeStatus(barId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_current_bar', { p_bar_id: barId });
  if (error) throw error;

  if (barId) await AsyncStorage.setItem(LAST_BAR_KEY, barId);
  else await AsyncStorage.removeItem(LAST_BAR_KEY);

  await AsyncStorage.setItem(TOUCH_KEY, String(Date.now()));
  await flushPendingNotifications();
}

/**
 * Tells the server the user is still where it was last told, every `TOUCH_MS`.
 * set_current_bar() leaves an unchanged bar's arrival and open visit alone, so
 * this costs a timestamp and announces nothing.
 */
async function touchStatus(barId: string): Promise<void> {
  const last = Number(await AsyncStorage.getItem(TOUCH_KEY));
  if (Number.isFinite(last) && Date.now() - last < TOUCH_MS) return;

  await writeStatus(barId);
}

/**
 * Keeps a confirmed status alive while the user stays put, drops it once they
 * leave, and asks about a new venue after they have been near it for
 * `DWELL_MS`. Nothing is ever sent to the server without the user answering
 * that prompt: the bar downstairs from an office would otherwise have people at
 * the bar all day. A user who is travelling is never asked, however long the
 * venues around them have been in range: a walk down a street of bars is not a
 * visit to any of them. Only the venues that have each served out the dwell
 * are offered, so a bar the user has only just reached is not carried in by a
 * neighbour they had been sitting near. `immediate` skips the dwell, the
 * motion check and the quiet periods, for a prompt the user asked for by hand.
 */
export async function syncStatusForLocation(
  point: LatLng,
  {
    immediate = false,
    speedMps = null,
    accuracyMeters = null,
  }: { immediate?: boolean; speedMps?: number | null; accuracyMeters?: number | null } = {}
): Promise<ResolvedStatus> {
  const moving = await noteFix({ point, at: Date.now(), speedMps, accuracyMeters });
  const lastBarId = await AsyncStorage.getItem(LAST_BAR_KEY);
  const venues = await barsNear(point);
  const current = stillAt(point, venues, lastBarId);

  if (current) {
    await AsyncStorage.removeItem(SIGHTING_KEY);
    await touchStatus(current.id);
    return { bar: current, changed: false };
  }

  // Leaving is reported straight away rather than after a dwell.
  const left = lastBarId !== null;
  if (left) {
    await writeStatus(null);
    await clearPendingVenue();
  }

  const candidates = venuesToConfirm(point, venues);
  if (candidates.length === 0) {
    await AsyncStorage.removeItem(SIGHTING_KEY);
    return { bar: null, changed: left };
  }

  if (!immediate && moving) {
    // Passing through is not the start of a visit: the clock restarts wherever
    // the user stops, rather than counting the block they walked down.
    await AsyncStorage.removeItem(SIGHTING_KEY);
    return { bar: null, changed: left };
  }

  if (immediate) {
    await promptForVenues(candidates, { force: true });
    return { bar: null, changed: left };
  }

  const dwelled = await dwelledVenues(candidates.map((venue) => venue.id));
  const asked = candidates.filter((venue) => dwelled.includes(venue.id));
  if (asked.length > 0) await promptForVenues(asked);

  return { bar: null, changed: left };
}

/**
 * What the app makes of where the user is, without changing any of it: how
 * stale its last fix is, whether it is still being told where the phone is, and
 * for each venue in range whether it is waiting out the dwell or has been
 * silenced. A user sitting in a bar that never asked has no other way to see
 * which of those happened.
 */
export async function diagnoseCheckIn(point: LatLng): Promise<CheckInReport> {
  const [venues, fix, quiet, tracking, sighting] = await Promise.all([
    barsNear(point),
    lastFix(),
    quietVenues(),
    isBackgroundUpdatesRunning(),
    AsyncStorage.getItem(SIGHTING_KEY).then(parseSighting),
  ]);

  const now = Date.now();
  return {
    fixAgeMs: fix ? Math.max(0, now - fix.at) : null,
    tracking,
    nearest: nearestVenue(point, venues),
    venues: reportOnVenues(point, venues, {
      sighting,
      prompted: quiet.prompted,
      declined: quiet.declined,
      fix,
      now,
    }),
  };
}

/** Checks the user in at a venue they confirmed they are at. */
export async function checkInAt(barId: string): Promise<void> {
  await writeStatus(barId);
  await allowVenue(barId);
  await clearPendingVenue();
}

export async function clearStatus(): Promise<void> {
  await AsyncStorage.multiRemove([LAST_BAR_KEY, SIGHTING_KEY, FIX_KEY, TOUCH_KEY]);
  await supabase.rpc('set_current_bar', { p_bar_id: null });
  await clearPendingVenue();
  await flushPendingNotifications();
}
