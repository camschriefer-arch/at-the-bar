import AsyncStorage from '@react-native-async-storage/async-storage';

import { barsNear } from './barCache';
import { type LatLng } from './geo';
import { flushPendingNotifications } from './notifications';
import { supabase } from './supabase';
import { isMoving, type Fix } from './motion';
import { noteSighting, stillAt, venuesToConfirm, type Sighting } from './venues';
import { allowVenue, clearPendingVenue, promptForVenues } from './venuePrompt';
import type { Bar } from './types';

const LAST_BAR_KEY = 'atb:lastBarId';
const SIGHTING_KEY = 'atb:sighting';
const FIX_KEY = 'atb:lastFix';

export type ResolvedStatus = { bar: Bar | null; changed: boolean };

async function readSighting(): Promise<Sighting | null> {
  const raw = await AsyncStorage.getItem(SIGHTING_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Sighting;
  } catch {
    return null;
  }
}

/** Whether the user has been near one of `barIds` long enough for it to count. */
async function hasDwelled(barIds: readonly string[]): Promise<boolean> {
  const { sighting, dwelled } = noteSighting(await readSighting(), barIds, Date.now());
  await AsyncStorage.setItem(SIGHTING_KEY, JSON.stringify(sighting));
  return dwelled;
}

/** Stores this fix and says whether the user got here by moving. */
async function noteFix(fix: Fix): Promise<boolean> {
  const raw = await AsyncStorage.getItem(FIX_KEY);
  let previous: Fix | null = null;

  if (raw) {
    try {
      previous = JSON.parse(raw) as Fix;
    } catch {
      previous = null;
    }
  }

  await AsyncStorage.setItem(FIX_KEY, JSON.stringify(fix));
  return isMoving(previous, fix);
}

async function writeStatus(barId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_current_bar', { p_bar_id: barId });
  if (error) throw error;

  if (barId) await AsyncStorage.setItem(LAST_BAR_KEY, barId);
  else await AsyncStorage.removeItem(LAST_BAR_KEY);

  await flushPendingNotifications();
}

/**
 * Keeps a confirmed status alive while the user stays put, drops it once they
 * leave, and asks about a new venue after they have been near it for
 * `DWELL_MS`. Nothing is ever sent to the server without the user answering
 * that prompt: the bar downstairs from an office would otherwise have people at
 * the bar all day. A user who is travelling is never asked, however long the
 * venues around them have been in range: a walk down a street of bars is not a
 * visit to any of them. `immediate` skips the dwell, the motion check and the
 * quiet periods, for a prompt the user asked for by hand.
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

  if (immediate || (await hasDwelled(candidates.map((venue) => venue.id)))) {
    await promptForVenues(candidates, { force: immediate });
  }

  return { bar: null, changed: left };
}

/** Checks the user in at a venue they confirmed they are at. */
export async function checkInAt(barId: string): Promise<void> {
  await writeStatus(barId);
  await allowVenue(barId);
  await clearPendingVenue();
}

export async function clearStatus(): Promise<void> {
  await AsyncStorage.multiRemove([LAST_BAR_KEY, SIGHTING_KEY, FIX_KEY]);
  await supabase.rpc('set_current_bar', { p_bar_id: null });
  await clearPendingVenue();
  await flushPendingNotifications();
}
