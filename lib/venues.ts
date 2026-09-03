import { allWithin, AT_BAR_RADIUS_METERS, nearestWithin, type LatLng } from './geo.ts';
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

/**
 * How many venues a user is asked to pick between. Dense blocks can have a
 * dozen in range, which is a list nobody reads.
 */
export const MAX_CHOICES = 5;

/** The venues close enough to be worth asking the user about, nearest first. */
export function venuesToConfirm(point: LatLng, venues: readonly Bar[]): Bar[] {
  return allWithin(point, venues).slice(0, MAX_CHOICES);
}

/**
 * Key for the dwell clock over a set of venues. Which of two neighbouring bars
 * is nearest flips with GPS jitter, so keying on the nearest one alone would
 * keep restarting the clock; the set as a whole is what has to stay put.
 */
export function sightingKey(venues: readonly Bar[]): string {
  return venues
    .map((venue) => venue.id)
    .sort()
    .join(',');
}
