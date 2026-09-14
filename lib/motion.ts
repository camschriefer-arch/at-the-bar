import { distanceMeters, type LatLng } from './geo.ts';

/**
 * A location fix cut down to what motion needs. It lives on the device only,
 * like every other coordinate the app handles.
 */
export type Fix = {
  point: LatLng;
  at: number;
  /** Metres per second. Negative or null when the platform has no reading. */
  speedMps: number | null;
  accuracyMeters: number | null;
};

/**
 * Faster than a stroll. Under this a phone is being carried around a room or
 * set on a table; over it the user is going somewhere.
 */
export const MOVING_SPEED_MPS = 1;

/**
 * How far two fixes have to be apart before the gap reads as travel rather
 * than GPS drift. A phone sitting indoors wanders tens of metres on its own,
 * and fixes arrive a minute apart, so a walking user clears this easily.
 */
export const MOVING_METERS = 40;

/** A fix older than this says nothing about where the user is now. */
export const FIX_STALE_MS = 15 * 60 * 1000;

/**
 * Whether the user is travelling rather than sitting somewhere. Either signal
 * is enough: an instantaneous speed reading misses a car stopped at a light,
 * and displacement misses the first fix after a gap, so the two cover each
 * other. Unknown reads as still — the dwell still has to elapse afterwards, so
 * the cost of guessing wrong is a prompt the user was going to get anyway.
 */
export function isMoving(previous: Fix | null, current: Fix): boolean {
  const speed = current.speedMps;
  if (speed !== null && speed >= MOVING_SPEED_MPS) return true;

  if (!previous) return false;

  const elapsed = current.at - previous.at;
  if (elapsed <= 0 || elapsed > FIX_STALE_MS) return false;

  // A fix only known to 80 m cannot prove an 80 m walk, so the fuzzier of the
  // two readings is added to what counts as having moved.
  const slop = Math.max(previous.accuracyMeters ?? 0, current.accuracyMeters ?? 0);
  return distanceMeters(previous.point, current.point) > MOVING_METERS + slop;
}
