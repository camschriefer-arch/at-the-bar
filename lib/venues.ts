import { allWithin, AT_BAR_RADIUS_METERS, nearestWithin, type LatLng } from './geo.ts';
import { FIX_STALE_MS } from './motion.ts';
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
export const DWELL_MS = 5 * 60 * 1000;

/** When each venue currently in range was first seen, and last seen. */
export type Sighting = Record<string, { since: number; last: number }>;

/**
 * How long a gap in sightings ends a stay. The app stops being told where the
 * phone is whenever iOS suspends the task, so a clock left running across a
 * gap says nothing: reopening the app hours later would otherwise satisfy the
 * dwell on the first fix and ask straight away.
 */
export const SIGHTING_GAP_MS = FIX_STALE_MS;

/**
 * Reads back a stored sighting, dropping anything that is not one. Entries
 * written before venues recorded when they were last seen are read as a stay
 * that ended, since there is no telling how long ago they were written.
 */
export function parseSighting(raw: string | null): Sighting | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;

  const sighting: Sighting = {};
  for (const [barId, seen] of Object.entries(parsed)) {
    if (typeof seen !== 'object' || seen === null) continue;

    const { since, last } = seen as { since?: unknown; last?: unknown };
    if (typeof since !== 'number' || typeof last !== 'number') continue;

    sighting[barId] = { since, last };
  }

  return sighting;
}

/**
 * Folds a sighting of `barIds` into what we knew, and says which of them have
 * been in range long enough. Each venue keeps its own clock, and answers for
 * itself alone: which venues are in range flips with GPS jitter, and a shared
 * clock would both restart every time a neighbour drifted in or out and let
 * the bar next door vouch for one the user has only just reached.
 */
export function noteSighting(
  previous: Sighting | null,
  barIds: readonly string[],
  now: number
): { sighting: Sighting; dwelled: string[] } {
  const sighting: Sighting = {};
  for (const barId of barIds) {
    const seen = previous?.[barId];
    const running =
      seen !== undefined &&
      seen.since <= now &&
      seen.last <= now &&
      now - seen.last <= SIGHTING_GAP_MS;

    sighting[barId] = { since: running ? seen.since : now, last: now };
  }

  const dwelled = Object.entries(sighting)
    .filter(([, seen]) => now - seen.since >= DWELL_MS)
    .map(([barId]) => barId);

  return { sighting, dwelled };
}

/** When each venue was last asked about, or last turned down. */
export type QuietVenues = Record<string, number>;

/** Marks `barIds` as quiet as of `now`, dropping entries that have run out. */
export function noteQuiet(
  previous: QuietVenues | null,
  barIds: readonly string[],
  now: number,
  quietMs: number
): QuietVenues {
  const quiet: QuietVenues = Object.fromEntries(barIds.map((id) => [id, now]));
  for (const [id, at] of Object.entries(previous ?? {})) {
    if (now - at < quietMs && quiet[id] === undefined) quiet[id] = at;
  }

  return quiet;
}

export function isQuiet(
  quiet: QuietVenues | null,
  barId: string,
  now: number,
  quietMs: number
): boolean {
  const at = quiet?.[barId];
  return at !== undefined && at <= now && now - at < quietMs;
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
