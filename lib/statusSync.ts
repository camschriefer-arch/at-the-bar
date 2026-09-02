import AsyncStorage from '@react-native-async-storage/async-storage';

import { barsNear } from './barCache';
import { type LatLng } from './geo';
import { flushPendingNotifications } from './notifications';
import { supabase } from './supabase';
import { resolveVenueAt, restaurantToConfirm } from './venues';
import { clearPendingVenue, promptForVenue } from './venuePrompt';
import type { Bar } from './types';

const LAST_BAR_KEY = 'atb:lastBarId';

export type ResolvedStatus = { bar: Bar | null; changed: boolean };

async function writeStatus(barId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_current_bar', { p_bar_id: barId });
  if (error) throw error;

  if (barId) await AsyncStorage.setItem(LAST_BAR_KEY, barId);
  else await AsyncStorage.removeItem(LAST_BAR_KEY);

  await flushPendingNotifications();
}

/**
 * Resolves the venue for `point` on device and pushes the result to the server
 * only when it differs from the last value we sent. When the only candidate is
 * a restaurant, nothing is sent and the user is asked instead.
 */
export async function syncStatusForLocation(point: LatLng): Promise<ResolvedStatus> {
  const lastBarId = await AsyncStorage.getItem(LAST_BAR_KEY);
  const venues = await barsNear(point);
  const bar = resolveVenueAt(point, venues, lastBarId);

  if (!bar) {
    const restaurant = restaurantToConfirm(point, venues);
    if (restaurant) await promptForVenue(restaurant);
  }

  const barId = bar?.id ?? null;
  if (barId === lastBarId) return { bar, changed: false };

  await writeStatus(barId);
  if (!barId) await clearPendingVenue();

  return { bar, changed: true };
}

/** Checks the user in at a venue they confirmed they are at. */
export async function checkInAt(barId: string): Promise<void> {
  await writeStatus(barId);
  await clearPendingVenue();
}

export async function clearStatus(): Promise<void> {
  await AsyncStorage.removeItem(LAST_BAR_KEY);
  await supabase.rpc('set_current_bar', { p_bar_id: null });
  await clearPendingVenue();
  await flushPendingNotifications();
}
