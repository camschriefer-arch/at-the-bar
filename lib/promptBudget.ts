/**
 * How much the app is allowed to ask in a day. The quiet periods in venues.ts
 * are per venue, which says nothing about how many prompts a person gets: on a
 * block with six venues, six separate first-time prompts are six notifications,
 * none of them repeats. This is the limit across all of them.
 */

/** The hour a night is considered over, so "not tonight" wears off. */
export const MORNING_HOUR = 6;

/**
 * How many prompts one person gets in a day. Three is enough for a night that
 * moves between bars while being few enough to read; past that the app is
 * guessing and the user has stopped looking.
 */
export const DAILY_PROMPT_CAP = 3;

/** When the app went quiet, and until when. */
export type PromptMute = { until: number };

/** How many prompts have gone out, and on which day. */
export type PromptTally = { day: string; count: number };

/**
 * The local calendar day, as the user would name it. Dates are the unit here
 * rather than a rolling 24 hours because "three a day" has to mean something
 * the user can predict.
 */
export function localDay(now: number): string {
  const at = new Date(now);
  return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`;
}

/** When the night a user is in now ends: the next `MORNING_HOUR` local. */
export function nextMorning(now: number): number {
  const morning = new Date(now);
  morning.setHours(MORNING_HOUR, 0, 0, 0);
  if (morning.getTime() <= now) morning.setDate(morning.getDate() + 1);

  return morning.getTime();
}

export function parseMute(raw: string | null): PromptMute | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { until?: unknown };
    return typeof parsed.until === 'number' ? { until: parsed.until } : null;
  } catch {
    return null;
  }
}

export function parseTally(raw: string | null): PromptTally | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { day?: unknown; count?: unknown };
    if (typeof parsed.day !== 'string' || typeof parsed.count !== 'number') return null;

    return { day: parsed.day, count: Math.max(0, Math.round(parsed.count)) };
  } catch {
    return null;
  }
}

/** Counts a prompt against today, starting again on a new day. */
export function countPrompt(tally: PromptTally | null, now: number): PromptTally {
  const day = localDay(now);
  return { day, count: tally?.day === day ? tally.count + 1 : 1 };
}

/** Why the app is not going to ask, or null if it is free to. */
export type PromptBlock = 'muted' | 'capped';

/**
 * Whether anything may be raised at all right now. A mute the user asked for
 * wins; otherwise today's allowance has to be left. A stale mute — one whose
 * night has passed — is simply ignored rather than needing clearing.
 */
export function promptBlock(
  mute: PromptMute | null,
  tally: PromptTally | null,
  now: number
): PromptBlock | null {
  if (mute !== null && now < mute.until) return 'muted';
  if (tally?.day === localDay(now) && tally.count >= DAILY_PROMPT_CAP) return 'capped';

  return null;
}
