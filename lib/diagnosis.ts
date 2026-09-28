import { AT_BAR_RADIUS_METERS, distanceMeters, type LatLng } from './geo.ts';
import { FIX_STALE_MS, type Fix } from './motion.ts';
import {
  DECLINE_QUIET_MS,
  DWELL_MS,
  isQuiet,
  PROMPT_COOLDOWN_MS,
  type QuietVenues,
  type Sighting,
} from './venues.ts';

/** Why a venue in range has not been asked about, or that it is about to be. */
export type VenueVerdict =
  | 'asking'
  | 'waiting'
  | 'asked-already'
  | 'turned-down'
  | 'not-tracked';

export type VenueReport = {
  barId: string;
  barName: string;
  meters: number;
  /** How long the venue's dwell clock has been running, if one is. */
  dwelledMs: number | null;
  verdict: VenueVerdict;
};

export type CheckInReport = {
  /** How stale the last fix the app was given is, or null if it has had none. */
  fixAgeMs: number | null;
  /** Whether the background task is running at all. */
  tracking: boolean;
  /** Everything in range of a check-in, nearest first. */
  venues: VenueReport[];
  /** The closest venue in the catalog, in range or not. */
  nearest: { barName: string; meters: number } | null;
};

type Named = LatLng & { id: string; name: string };

/** The closest venue the catalog knows about, however far off it is. */
export function nearestVenue(
  point: LatLng,
  venues: readonly Named[]
): { barName: string; meters: number } | null {
  return venues
    .map((venue) => ({ barName: venue.name, meters: distanceMeters(point, venue) }))
    .sort((a, b) => a.meters - b.meters)[0] ?? null;
}

/**
 * Explains, for each venue in range, what the check-in logic makes of it. This
 * is what the app would decide on the next fix, so it answers the question a
 * user who was not asked about the bar they are sitting in actually has: the
 * quiet periods and the dwell are both invisible otherwise, and "nothing
 * happened" looks the same whether the venue was silenced two weeks ago or the
 * phone has not been heard from since lunch.
 */
export function reportOnVenues(
  point: LatLng,
  venues: readonly Named[],
  {
    sighting,
    prompted,
    declined,
    fix,
    now,
  }: {
    sighting: Sighting | null;
    prompted: QuietVenues | null;
    declined: QuietVenues | null;
    fix: Fix | null;
    now: number;
  }
): VenueReport[] {
  const stale = fix === null || now - fix.at > FIX_STALE_MS;

  return venues
    .map((venue) => ({ venue, meters: distanceMeters(point, venue) }))
    .filter(({ meters }) => meters <= AT_BAR_RADIUS_METERS)
    .sort((a, b) => a.meters - b.meters)
    .map(({ venue, meters }) => {
      const seen = sighting?.[venue.id];
      const dwelledMs = seen ? Math.max(0, now - seen.since) : null;

      const verdict: VenueVerdict = isQuiet(declined, venue.id, now, DECLINE_QUIET_MS)
        ? 'turned-down'
        : isQuiet(prompted, venue.id, now, PROMPT_COOLDOWN_MS)
          ? 'asked-already'
          : stale
            ? 'not-tracked'
            : dwelledMs !== null && dwelledMs >= DWELL_MS
              ? 'asking'
              : 'waiting';

      return { barId: venue.id, barName: venue.name, meters, dwelledMs, verdict };
    });
}
