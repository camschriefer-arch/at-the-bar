import AsyncStorage from '@react-native-async-storage/async-storage';

import { barsNear } from './barCache';
import { type LatLng } from './geo';
import { flushPendingNotifications } from './notifications';
import { supabase } from './supabase';
import { noteSighting, resolveVenueAt, restaurantToConfirm, type Sighting } from './venues';
import { clearPendingVenue, promptForVenue } from './venuePrompt';
import type { Bar } from './types';

const LAST_BAR_KEY = 'atb:lastBarId';
const SIGHTING_KEY = 'atb:sighting';

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

/** Whether the user has been at `barId` long enough for it to count. */
async function hasDwelled(barId: string): Promise<boolean> {
  const { sighting, dwelled } = noteSighting(await readSighting(), barId, Date.now());
  await AsyncStorage.setItem(SIGHTING_KEY, JSON.stringify(sighting));
  return dwelled;
}

async function writeStatus(barId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_current_bar', { p_bar_id: barId });
  if (error) throw error;

  if (barId) await AsyncStorage.setItem(LAST_BAR_KEY, barId);
  else await AsyncStorage.removeItem(LAST_BAR_KEY);

  await flushPendingNotifications();
}

/**
 * Resolves the venue for `point` on device and pushes the result to the server
 * only when it differs from the last value we sent. A venue counts only once
 * the user has stayed near it for `DWELL_MS`, so passing one changes nothing;
 * `immediate` skips that wait for a check-in the user asked for by hand. When
 * the only candidate is a restaurant, nothing is sent and the user is asked.
 */
export async function syncStatusForLocation(
  point: LatLng,
  { immediate = false }: { immediate?: boolean } = {}
): Promise<ResolvedStatus> {
  const lastBarId = await AsyncStorage.getItem(LAST_BAR_KEY);
  const venues = await barsNear(point);
  const bar = resolveVenueAt(point, venues, lastBarId);
  const candidate = bar ?? restaurantToConfirm(point, venues);

  // Nothing in range: drop the status right away rather than after a dwell, so
  // leaving is never reported late.
  if (!candidate) {
    await AsyncStorage.removeItem(SIGHTING_KEY);
    if (!lastBarId) return { bar: null, changed: false };

    await writeStatus(null);
    await clearPendingVenue();
    return { bar: null, changed: true };
  }

  if (candidate.id === lastBarId) {
    await AsyncStorage.removeItem(SIGHTING_KEY);
    return { bar, changed: false };
  }

  if (!immediate && !(await hasDwelled(candidate.id))) {
    return { bar: venues.find((venue) => venue.id === lastBarId) ?? null, changed: false };
  }

  if (!bar) {
    await promptForVenue(candidate);
    return { bar: null, changed: false };
  }

  await writeStatus(bar.id);
  return { bar, changed: true };
}

/** Checks the user in at a venue they confirmed they are at. */
export async function checkInAt(barId: string): Promise<void> {
  await writeStatus(barId);
  await clearPendingVenue();
}

export async function clearStatus(): Promise<void> {
  await AsyncStorage.multiRemove([LAST_BAR_KEY, SIGHTING_KEY]);
  await supabase.rpc('set_current_bar', { p_bar_id: null });
  await clearPendingVenue();
  await flushPendingNotifications();
}
