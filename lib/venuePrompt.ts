import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { logEvent } from './analytics';
import {
  countPrompt,
  nextMorning,
  parseMute,
  parseTally,
  promptBlock,
  type PromptBlock,
} from './promptBudget';
import type { Bar } from './types';
import {
  DECLINE_QUIET_MS,
  isQuiet,
  noteQuiet,
  PROMPT_COOLDOWN_MS,
  type QuietVenues,
} from './venues';

export const VENUE_PROMPT_CATEGORY = 'venue.confirm';
export const VENUE_PROMPT_CONFIRM = 'venue.confirm.yes';
export const VENUE_PROMPT_DISMISS = 'venue.confirm.no';
export const VENUE_PROMPT_MUTE = 'venue.confirm.notout';

const PENDING_KEY = 'atb:pendingVenue';
const PROMPTED_KEY = 'atb:promptedVenues';
const DECLINED_KEY = 'atb:declinedVenues';
const MUTE_KEY = 'atb:venueMute';
const TALLY_KEY = 'atb:promptTally';

export type PendingChoice = { barId: string; barName: string };

/** The venues the user was asked about, nearest first. */
export type PendingVenue = {
  choices: PendingChoice[];
  promptedAt: number;
  notificationId?: string;
  /** How far off the nearest of them was when asked. */
  meters?: number;
  /** How long it had been in range when asked. */
  dwelledMs?: number;
};

let categoryRegistered = false;

async function ensureCategory(): Promise<void> {
  if (categoryRegistered) return;

  await Notifications.setNotificationCategoryAsync(VENUE_PROMPT_CATEGORY, [
    {
      identifier: VENUE_PROMPT_CONFIRM,
      buttonTitle: "Yes, I'm here",
      // Confirming writes to the server, so the app has to come up to do it.
      options: { opensAppToForeground: true },
    },
    {
      identifier: VENUE_PROMPT_DISMISS,
      buttonTitle: 'Not here',
      options: { opensAppToForeground: false },
    },
    {
      identifier: VENUE_PROMPT_MUTE,
      buttonTitle: 'Not out today',
      options: { opensAppToForeground: false },
    },
  ]);

  categoryRegistered = true;
}

async function readQuiet(key: string): Promise<QuietVenues> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return {};

  try {
    return JSON.parse(raw) as QuietVenues;
  } catch {
    return {};
  }
}

async function recordQuiet(
  key: string,
  barIds: readonly string[],
  quietMs: number
): Promise<void> {
  const quiet = noteQuiet(await readQuiet(key), barIds, Date.now(), quietMs);
  await AsyncStorage.setItem(key, JSON.stringify(quiet));
}

/** Whether a venue is inside either quiet period and so should not be raised. */
export async function isSuppressed(barId: string): Promise<boolean> {
  const now = Date.now();
  const [prompted, declined] = await Promise.all([
    readQuiet(PROMPTED_KEY),
    readQuiet(DECLINED_KEY),
  ]);

  return (
    isQuiet(prompted, barId, now, PROMPT_COOLDOWN_MS) ||
    isQuiet(declined, barId, now, DECLINE_QUIET_MS)
  );
}

/**
 * Records that the user said they are not at the venue they were asked about.
 * Turning down a single venue is the clearest signal the app gets that it is
 * somewhere the user passes rather than goes, so it is worth remembering for
 * much longer than an unanswered prompt. "None of these" is not that signal:
 * it is one answer about several venues, on a block the user is evidently on,
 * so it only holds for the usual cooldown rather than silencing every bar
 * around them for a fortnight. `source` says what the user turned it down
 * from, so a notification button and the card in the app can be told apart.
 */
export async function declinePendingVenue(source = 'app'): Promise<void> {
  const pending = await getPendingVenue();
  const choices = pending?.choices ?? [];
  if (choices.length > 0) {
    const one = choices.length === 1;
    await recordQuiet(
      one ? DECLINED_KEY : PROMPTED_KEY,
      choices.map((choice) => choice.barId),
      one ? DECLINE_QUIET_MS : PROMPT_COOLDOWN_MS
    );

    void logEvent('prompt_declined', {
      barId: one ? choices[0].barId : null,
      source,
      venueCount: choices.length,
      answeredInMs: pending ? Date.now() - pending.promptedAt : null,
      // Carried from the prompt: an answer is only worth measuring against the
      // distance and the dwell that the app decided to ask on.
      meters: pending?.meters ?? null,
      dwelledMs: pending?.dwelledMs ?? null,
    });
  }

  await clearPendingVenue();
}

/**
 * Silences every venue until the morning. This is the answer to a prompt that
 * was simply unwelcome rather than wrong: "Not here" is about a venue, and on
 * a block of them it has to be given venue by venue, which is the thing that
 * makes the app feel like it is nagging. One tap ends the day instead.
 */
export async function muteVenuePrompts(now = Date.now()): Promise<void> {
  await AsyncStorage.setItem(MUTE_KEY, JSON.stringify({ until: nextMorning(now) }));
  await clearPendingVenue();
}

/** Why nothing is being raised at all right now, or null if it would be. */
export async function promptsBlocked(now = Date.now()): Promise<PromptBlock | null> {
  const [mute, tally] = await Promise.all([
    AsyncStorage.getItem(MUTE_KEY).then(parseMute),
    AsyncStorage.getItem(TALLY_KEY).then(parseTally),
  ]);

  return promptBlock(mute, tally, now);
}

/** The two quiet periods as they stand, for explaining a prompt that never came. */
export async function quietVenues(): Promise<{
  prompted: QuietVenues;
  declined: QuietVenues;
}> {
  const [prompted, declined] = await Promise.all([
    readQuiet(PROMPTED_KEY),
    readQuiet(DECLINED_KEY),
  ]);

  return { prompted, declined };
}

/**
 * Holds a venue quiet for the usual cooldown, for a visit the user has just
 * said is over. They are often still inside the radius when they say so, and
 * the dwell clock restarts from the moment the status ends, so without this the
 * app asks about the bar they have just left minutes later.
 */
export async function quietenVenue(barId: string): Promise<void> {
  await recordQuiet(PROMPTED_KEY, [barId], PROMPT_COOLDOWN_MS);
}

/** Drops both quiet periods, for a user who wants to be asked again now. */
export async function askAgainEverywhere(): Promise<void> {
  await AsyncStorage.multiRemove([PROMPTED_KEY, DECLINED_KEY, MUTE_KEY, TALLY_KEY]);
}

/**
 * Forgets the quiet periods in the way of a user who has just checked in. Their
 * own venue loses both: they have said they do go there, whatever they answered
 * last time. Every other venue loses the prompt cooldown, which is only there
 * so an unanswered question does not repeat — a check-in answers it, and the
 * next bar of the night is usually one of the neighbours that went quiet
 * alongside this one. "Not here" is left standing everywhere else, because that
 * answer was about those venues.
 */
export async function allowVenue(barId: string): Promise<void> {
  await AsyncStorage.removeItem(PROMPTED_KEY);

  const declined = await readQuiet(DECLINED_KEY);
  if (declined[barId] === undefined) return;

  delete declined[barId];
  await AsyncStorage.setItem(DECLINED_KEY, JSON.stringify(declined));
}

/**
 * Asks whether the user is at one of `bars` (nearest first). No venue sets a
 * status on its own, so an answered prompt is the only way one becomes a
 * check-in. Several venues in range get one notification rather than one each:
 * the phone cannot tell which of two adjacent bars you are in, so the user
 * picks from a list in the app. Venues already asked about are dropped from
 * the list rather than silencing it: a bar down the street from one you were
 * asked about earlier is a new visit, and one turned down stays quiet for a
 * fortnight. A day's worth of prompts, or a user who said they are not out,
 * stops the lot: the quiet periods are per venue and cannot see how many
 * notifications a person has had. `force` re-asks through all of it, for a
 * prompt the user asked for by hand. Returns the venues actually asked about,
 * which is what the caller measures rather than the list it offered.
 */
export async function promptForVenues(
  candidates: readonly Bar[],
  { force = false } = {}
): Promise<Bar[]> {
  if (!force && (await promptsBlocked()) !== null) return [];

  const quiet = force
    ? candidates.map(() => false)
    : await Promise.all(candidates.map((bar) => isSuppressed(bar.id)));
  const bars = candidates.filter((_, index) => !quiet[index]);
  if (bars.length === 0) return [];

  await recordQuiet(
    PROMPTED_KEY,
    bars.map((bar) => bar.id),
    PROMPT_COOLDOWN_MS
  );
  const choices = bars.map((bar) => ({ barId: bar.id, barName: bar.name }));
  await clearPendingVenue();

  const single = bars.length === 1 ? bars[0] : null;

  await ensureCategory();
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'At the bar?',
      body: single
        ? `Are you at ${single.name}? Tap yes and your friends will see it.`
        : 'There is more than one bar around you. Open the app to check in and pick the one you are at.',
      // A list cannot be picked from a notification button.
      ...(single ? { categoryIdentifier: VENUE_PROMPT_CATEGORY } : {}),
      data: single
        ? { kind: 'venue-confirm', barId: single.id, barName: single.name }
        : { kind: 'venue-choose' },
    },
    trigger: null,
  });

  await AsyncStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ choices, promptedAt: Date.now(), notificationId } satisfies PendingVenue)
  );

  // One notification about several venues is one prompt, which is what the cap
  // counts: it is there to limit interruptions, not venues.
  const now = Date.now();
  await AsyncStorage.setItem(
    TALLY_KEY,
    JSON.stringify(countPrompt(parseTally(await AsyncStorage.getItem(TALLY_KEY)), now))
  );

  return bars;
}

/**
 * Keeps what the app knew when it asked alongside the prompt itself, so the
 * answer can be measured against it. The distance and the dwell are only known
 * at the moment of asking, and the answer can arrive hours later.
 */
export async function measurePending(meters: number, dwelledMs: number | null): Promise<void> {
  const pending = await getPendingVenue();
  if (!pending) return;

  await AsyncStorage.setItem(
    PENDING_KEY,
    JSON.stringify({
      ...pending,
      meters,
      ...(dwelledMs === null ? {} : { dwelledMs }),
    } satisfies PendingVenue)
  );
}

/** The venue the user was last asked about and has not answered yet. */
export async function getPendingVenue(): Promise<PendingVenue | null> {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return null;

  try {
    const pending = JSON.parse(raw) as PendingVenue;
    // An unanswered prompt is stale once the cooldown that suppresses it ends.
    if (!pending.choices?.length || Date.now() - pending.promptedAt > PROMPT_COOLDOWN_MS) {
      await clearPendingVenue();
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

/** Drops the pending prompt and takes its notification out of the tray. */
export async function clearPendingVenue(): Promise<void> {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  await AsyncStorage.removeItem(PENDING_KEY);
  if (!raw) return;

  try {
    const { notificationId } = JSON.parse(raw) as PendingVenue;
    if (notificationId) await Notifications.dismissNotificationAsync(notificationId);
  } catch {
    // Nothing to dismiss if the record was unreadable.
  }
}
