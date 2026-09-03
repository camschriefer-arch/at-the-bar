import AsyncStorage from '@react-native-async-storage/async-storage';

import { barsNear } from './barCache';
import { type LatLng } from './geo';
import { flushPendingNotifications } from './notifications';
import { supabase } from './supabase';
import { noteSighting, sightingKey, stillAt, venuesToConfirm, type Sighting } from './venues';
import { clearPendingVenue, promptForVenues } from './venuePrompt';
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

/** Whether the user has been at `key` long enough for it to count. */
async function hasDwelled(key: string): Promise<boolean> {
  const { sighting, dwelled } = noteSighting(await readSighting(), key, Date.now());
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
 * Keeps a confirmed status alive while the user stays put, drops it once they
 * leave, and asks about a new venue after they have been near it for
 * `DWELL_MS`. Nothing is ever sent to the server without the user answering
 * that prompt: the bar downstairs from an office would otherwise have people at
 * the bar all day. `immediate` skips the dwell and the once-per-visit cooldown,
 * for a prompt the user asked for by hand.
 */
export async function syncStatusForLocation(
  point: LatLng,
  { immediate = false }: { immediate?: boolean } = {}
): Promise<ResolvedStatus> {
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

  if (immediate || (await hasDwelled(sightingKey(candidates)))) {
    await promptForVenues(candidates, { force: immediate });
  }

  return { bar: null, changed: left };
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
