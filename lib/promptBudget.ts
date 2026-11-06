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

/**
 * How many prompts a day someone gets once they have left one unanswered.
 * Ignoring a question is an answer of a kind — the app asked at a moment that
 * was not worth their attention — so it stops asking after one more.
 */
export const IGNORED_PROMPT_CAP = 2;

/** How long after an ignored prompt the app waits before the one it has left. */
export const IGNORED_PROMPT_GAP_MS = 3 * 60 * 60 * 1000;

/** When the app went quiet, and until when. */
export type PromptMute = { until: number };

/**
 * How many prompts have gone out today, how many of them the user answered,
 * and when the last one went. Answers are counted rather than matched to
 * their prompt: the question is how often the app asked for nothing, which
 * does not need to know which question was which.
 */
export type PromptTally = { day: string; count: number; answered: number; lastAt: number };

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
    const parsed = JSON.parse(raw) as {
      day?: unknown;
      count?: unknown;
      answered?: unknown;
      lastAt?: unknown;
    };
    if (typeof parsed.day !== 'string' || typeof parsed.count !== 'number') return null;

    const count = Math.max(0, Math.round(parsed.count));
    return {
      day: parsed.day,
      count,
      // Tallies written before answers were counted: read as answered, so an
      // upgrade mid-day does not silence someone who has been replying.
      answered: typeof parsed.answered === 'number' ? Math.max(0, Math.round(parsed.answered)) : count,
      lastAt: typeof parsed.lastAt === 'number' ? parsed.lastAt : 0,
    };
  } catch {
    return null;
  }
}

const today = (tally: PromptTally | null, now: number): PromptTally =>
  tally?.day === localDay(now)
    ? tally
    : { day: localDay(now), count: 0, answered: 0, lastAt: 0 };

/** Counts a prompt against today, starting again on a new day. */
export function countPrompt(tally: PromptTally | null, now: number): PromptTally {
  const day = today(tally, now);
  return { ...day, count: day.count + 1, lastAt: now };
}

/** Counts an answer to a prompt, so that prompt does not read as ignored. */
export function answerPrompt(tally: PromptTally | null, now: number): PromptTally {
  const day = today(tally, now);
  return { ...day, answered: Math.min(day.count, day.answered + 1) };
}

/** Whether anything the app asked today went unanswered. */
export function ignoredPrompt(tally: PromptTally | null, now: number): boolean {
  const day = today(tally, now);
  return day.count > day.answered;
}

/** Why the app is not going to ask, or null if it is free to. */
export type PromptBlock = 'muted' | 'capped' | 'ignored';

/**
 * Whether anything may be raised at all right now. A mute the user asked for
 * wins; otherwise today's allowance has to be left. A stale mute — one whose
 * night has passed — is simply ignored rather than needing clearing.
 *
 * A question left unanswered costs the day most of its allowance: one more
 * prompt, and not for three hours. Someone who did not want to answer the
 * first one is not going to want the next two in the same hour, and the app
 * has nothing new to go on until they do answer something.
 */
export function promptBlock(
  mute: PromptMute | null,
  tally: PromptTally | null,
  now: number
): PromptBlock | null {
  if (mute !== null && now < mute.until) return 'muted';

  const day = today(tally, now);
  const ignored = ignoredPrompt(day, now);
  if (day.count >= (ignored ? IGNORED_PROMPT_CAP : DAILY_PROMPT_CAP)) return 'capped';
  if (ignored && now - day.lastAt < IGNORED_PROMPT_GAP_MS) return 'ignored';

  return null;
}
