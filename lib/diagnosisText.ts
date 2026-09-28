import type { CheckInReport, VenueReport } from './diagnosis.ts';
import { formatMinutes } from './duration.ts';
import { DWELL_MS } from './venues.ts';

const FEET_PER_METER = 3.28084;

const minutes = (ms: number) => formatMinutes(ms / 60_000) ?? 'less than a minute';

/** How far away a venue is, in the units the prompt would be read in. */
export function formatDistance(meters: number): string {
  return `${Math.round(meters * FEET_PER_METER)} ft`;
}

/** What the app is waiting for at one venue, in a line a user can act on. */
export function describeVenue(venue: VenueReport): string {
  switch (venue.verdict) {
    case 'asking':
      return 'Ready — you will be asked about this one on the next location check.';
    case 'waiting':
      return venue.dwelledMs === null
        ? `Waiting — the ${minutes(DWELL_MS)} clock starts at the next location check.`
        : `Waiting — ${minutes(venue.dwelledMs)} of ${minutes(DWELL_MS)} here.`;
    case 'asked-already':
      return 'Silenced — you were asked about this one in the last few hours.';
    case 'turned-down':
      return 'Silenced — you said you were not here, which lasts a fortnight.';
    case 'not-tracked':
      return 'Nothing is counting — the app has not been told where you are recently.';
  }
}

/** The state of location tracking itself, above the venues. */
export function describeTracking(report: CheckInReport): string {
  const heard =
    report.fixAgeMs === null
      ? 'The app has never been told where you are.'
      : `Last location ${minutes(report.fixAgeMs)} ago.`;

  return report.tracking
    ? `Running in the background. ${heard}`
    : `Not running in the background. ${heard}`;
}

/** The one sentence to lead with: why no prompt came. */
export function summarise(report: CheckInReport): string {
  if (report.venues.length === 0) {
    return report.nearest === null
      ? 'No venues here at all. Add the place if the catalog is missing it.'
      : `Nowhere close enough. The nearest is ${report.nearest.barName}, ${formatDistance(report.nearest.meters)} from where your phone puts you.`;
  }

  if (report.venues.some((venue) => venue.verdict === 'asking')) {
    return 'A venue here is ready to be asked about.';
  }

  if (report.venues.every((venue) => venue.verdict === 'not-tracked')) {
    return 'Your location has not reached the app recently, so nothing is being counted.';
  }

  if (
    report.venues.every(
      (venue) => venue.verdict === 'asked-already' || venue.verdict === 'turned-down'
    )
  ) {
    return 'Everywhere around you is silenced. Ask me again to clear that.';
  }

  return 'Still waiting out the time it takes for a stop to count as a visit.';
}
