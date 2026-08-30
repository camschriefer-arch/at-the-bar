import AsyncStorage from '@react-native-async-storage/async-storage';

import { barsNear } from './barCache';
import { AT_BAR_RADIUS_METERS, nearestWithin, type LatLng } from './geo';
import { supabase } from './supabase';
import type { Bar } from './types';

/**
 * A user has to get within 0.1 mi to check in but only drops off the map past
 * 0.15 mi, so GPS jitter at the edge of a bar does not flap the status.
 */
const LEAVE_RADIUS_METERS = AT_BAR_RADIUS_METERS * 1.5;

const LAST_BAR_KEY = 'atb:lastBarId';

export type ResolvedStatus = { bar: Bar | null; changed: boolean };

export async function resolveBarAt(
  point: LatLng,
  currentBarId: string | null
): Promise<Bar | null> {
  const bars = await barsNear(point);
  const current = currentBarId ? bars.find((bar) => bar.id === currentBarId) : undefined;

  if (current) {
    const stillThere = nearestWithin(point, [current], LEAVE_RADIUS_METERS);
    if (stillThere) return current;
  }

  return nearestWithin(point, bars)?.item ?? null;
}

/**
 * Resolves the bar for `point` on device and pushes the result to the server
 * only when it differs from the last value we sent.
 */
export async function syncStatusForLocation(point: LatLng): Promise<ResolvedStatus> {
  const lastBarId = await AsyncStorage.getItem(LAST_BAR_KEY);
  const bar = await resolveBarAt(point, lastBarId);
  const barId = bar?.id ?? null;

  if (barId === lastBarId) return { bar, changed: false };

  const { error } = await supabase.rpc('set_current_bar', { p_bar_id: barId });
  if (error) throw error;

  if (barId) {
    await AsyncStorage.setItem(LAST_BAR_KEY, barId);
  } else {
    await AsyncStorage.removeItem(LAST_BAR_KEY);
  }

  return { bar, changed: true };
}

export async function clearStatus(): Promise<void> {
  await AsyncStorage.removeItem(LAST_BAR_KEY);
  await supabase.rpc('set_current_bar', { p_bar_id: null });
}
