import { allWithin, AT_BAR_RADIUS_METERS, nearestWithin, type LatLng } from './geo.ts';
import type { Bar } from './types';

/**
 * A user has to get within 0.1 mi to check in but only drops off the map past
 * 0.045 mi, so GPS jitter at the edge of a bar does not flap the status.
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

/** When each venue currently in range was first seen. */
export type Sighting = Record<string, number>;

/**
 * Folds a sighting of `barIds` into what we knew, and says whether any one of
 * them has been in range long enough. Each venue keeps its own clock: which
 * venues are in range flips with GPS jitter, and a shared clock would restart
 * every time a neighbour drifted in or out.
 */
export function noteSighting(
  previous: Sighting | null,
  barIds: readonly string[],
  now: number
): { sighting: Sighting; dwelled: boolean } {
  const sighting: Sighting = {};
  for (const barId of barIds) {
    const since = previous?.[barId];
    sighting[barId] = since !== undefined && since <= now ? since : now;
  }

  const dwelled = Object.values(sighting).some((since) => now - since >= DWELL_MS);
  return { sighting, dwelled };
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
