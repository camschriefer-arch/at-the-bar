import { AT_BAR_RADIUS_METERS, nearestWithin, type LatLng } from './geo.ts';
import type { Bar } from './types';

/**
 * A user has to get within 0.05 mi to check in but only drops off the map past
 * 0.075 mi, so GPS jitter at the edge of a bar does not flap the status.
 */
export const LEAVE_RADIUS_METERS = AT_BAR_RADIUS_METERS * 1.5;

/**
 * The venue the user is already checked in to, while they stay near it. No
 * venue ever checks a user in on its own — an office over a pub would put you
 * at the bar all day — so this only keeps a confirmed status alive.
 */
export function stillAt(
  point: LatLng,
  venues: readonly Bar[],
  currentBarId: string | null
): Bar | null {
  const current = currentBarId ? venues.find((venue) => venue.id === currentBarId) : null;
  if (!current) return null;

  return nearestWithin(point, [current], LEAVE_RADIUS_METERS) ? current : null;
}

/**
 * How long a user has to stay near a venue before it counts. Walking or driving
 * past a bar takes seconds; this is what keeps a commute from setting a status
 * or firing a string of "are you here?" notifications.
 */
export const DWELL_MS = 3 * 60 * 1000;

export type Sighting = { barId: string; since: number };

/**
 * Folds a sighting of `barId` into what we knew, and says whether the user has
 * now been there long enough. Moving to a different venue restarts the clock.
 */
export function noteSighting(
  previous: Sighting | null,
  barId: string,
  now: number
): { sighting: Sighting; dwelled: boolean } {
  if (!previous || previous.barId !== barId || previous.since > now) {
    return { sighting: { barId, since: now }, dwelled: false };
  }

  return { sighting: previous, dwelled: now - previous.since >= DWELL_MS };
}

/** The venue close enough to be worth asking the user about, if any. */
export function venueToConfirm(point: LatLng, venues: readonly Bar[]): Bar | null {
  return nearestWithin(point, venues)?.item ?? null;
}
