/**
 * What the app records about its own behaviour. These are the questions the
 * tables the app already writes cannot answer: how often it asks and is told
 * no, how long someone had been there when it asked, and whether anyone uses
 * the buttons on a notification.
 *
 * Nothing here carries a position. A prompt event names the venue it was about
 * and how far off the user was, both of which the user was shown at the time;
 * no coordinate is ever sent, so there is nothing to reassemble a route from.
 */
export type AppEvent =
  | 'prompt_shown'
  | 'prompt_declined'
  | 'check_in'
  | 'check_in_found_nothing'
  | 'notification_opened';

export type EventDetail = {
  barId?: string | null;
  /** Which path through the app this came from, e.g. 'notification'. */
  source?: string | null;
  venueCount?: number | null;
  /** How long the venue had been in range, in milliseconds. */
  dwelledMs?: number | null;
  meters?: number | null;
  /** How long the user took to answer, in milliseconds. */
  answeredInMs?: number | null;
};

export type EventRow = {
  event: AppEvent;
  bar_id?: string;
  source?: string;
  venue_count?: number;
  dwell_seconds?: number;
  distance_meters?: number;
  answer_seconds?: number;
};

/** Distance is rounded to this, so an event cannot be read as a position. */
export const DISTANCE_STEP_METERS = 10;

function seconds(ms: number | null | undefined): number | undefined {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return undefined;
  return Math.max(0, Math.round(ms / 1000));
}

/**
 * The row an event becomes. Absent and unmeasured are the same thing here: a
 * missing number is left out rather than written as a zero, because a zero
 * would average in as "asked the moment they arrived".
 */
export function eventRow(event: AppEvent, detail: EventDetail = {}): EventRow {
  const meters =
    typeof detail.meters === 'number' && Number.isFinite(detail.meters)
      ? Math.max(0, Math.round(detail.meters / DISTANCE_STEP_METERS) * DISTANCE_STEP_METERS)
      : undefined;

  const count =
    typeof detail.venueCount === 'number' && Number.isFinite(detail.venueCount)
      ? Math.max(0, Math.round(detail.venueCount))
      : undefined;

  const row: EventRow = { event };
  if (detail.barId) row.bar_id = detail.barId;
  if (detail.source) row.source = detail.source;
  if (count !== undefined) row.venue_count = count;

  const dwell = seconds(detail.dwelledMs);
  if (dwell !== undefined) row.dwell_seconds = dwell;
  if (meters !== undefined) row.distance_meters = meters;

  const answer = seconds(detail.answeredInMs);
  if (answer !== undefined) row.answer_seconds = answer;

  return row;
}
