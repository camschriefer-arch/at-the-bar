import { AT_BAR_RADIUS_METERS, nearestWithin, type LatLng } from './geo.ts';
import type { Bar } from './types';

/**
 * A user has to get within 0.05 mi to check in but only drops off the map past
 * 0.075 mi, so GPS jitter at the edge of a bar does not flap the status.
 */
export const LEAVE_RADIUS_METERS = AT_BAR_RADIUS_METERS * 1.5;

/** Restaurants take a confirmed prompt; bars and pubs do not. */
export const checksInAutomatically = (venue: Bar) => venue.category !== 'restaurant';

/**
 * The venue the user counts as being at: the one they are already checked in to
 * while they stay near it, otherwise the nearest bar or pub.
 */
export function resolveVenueAt(
  point: LatLng,
  venues: readonly Bar[],
  currentBarId: string | null
): Bar | null {
  const current = currentBarId ? venues.find((venue) => venue.id === currentBarId) : undefined;

  if (current && nearestWithin(point, [current], LEAVE_RADIUS_METERS)) return current;

  return nearestWithin(point, venues.filter(checksInAutomatically))?.item ?? null;
}

/** The restaurant close enough to be worth asking the user about, if any. */
export function restaurantToConfirm(point: LatLng, venues: readonly Bar[]): Bar | null {
  const candidates = venues.filter((venue) => !checksInAutomatically(venue));
  return nearestWithin(point, candidates)?.item ?? null;
}
