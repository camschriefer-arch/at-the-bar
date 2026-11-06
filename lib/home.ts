/**
 * Where the user lives, so the app stops asking whether they are at the bar
 * downstairs. Home is the one place a person is most often stationary near
 * venues, which is exactly the shape of an arrival, so without this a flat
 * above a pub is a prompt every evening.
 *
 * It never leaves the phone. The whole premise of the app is that raw
 * coordinates are the user's own, and a home address is the most sensitive
 * coordinate there is: it lives in local storage, is compared locally, and no
 * part of it is sent to the server or carried in a diagnostic report.
 */

import { distanceMeters, type LatLng } from './geo.ts';

const HOME_KEY = 'atb:home';

/**
 * How close to home counts as home. The same radius the app uses to decide
 * someone is at a venue, so the bars it would have asked about are the bars
 * this silences — wider would quieten a block the user does go out on.
 */
export const HOME_RADIUS_MILES = 0.1;
export const HOME_RADIUS_METERS = HOME_RADIUS_MILES * 1609.344;

export type Home = LatLng & { setAt: number };

export function parseHome(raw: string | null): Home | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown; setAt?: unknown };
    if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') return null;

    return {
      lat: parsed.lat,
      lng: parsed.lng,
      setAt: typeof parsed.setAt === 'number' ? parsed.setAt : 0,
    };
  } catch {
    return null;
  }
}

/** Whether `point` is close enough to home for the app to hold its tongue. */
export function isAtHome(home: Home | null, point: LatLng): boolean {
  return home !== null && distanceMeters(home, point) <= HOME_RADIUS_METERS;
}
