import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import type { Bar } from './types';
import { isQuiet, noteQuiet, type QuietVenues } from './venues';

export const VENUE_PROMPT_CATEGORY = 'venue.confirm';
export const VENUE_PROMPT_CONFIRM = 'venue.confirm.yes';
export const VENUE_PROMPT_DISMISS = 'venue.confirm.no';

const PENDING_KEY = 'atb:pendingVenue';
const PROMPTED_KEY = 'atb:promptedVenues';
const DECLINED_KEY = 'atb:declinedVenues';

/**
 * A venue is only asked about once per visit: long enough that walking past the
 * same bar twice in an evening does not nag, short enough that going back the
 * next day asks again.
 */
const PROMPT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * How long "Not here" lasts. The venues a user turns down are the ones they
 * pass every day — the cafe by the office, the restaurant under the gym — so
 * asking again tomorrow asks forever. Two weeks answers once a fortnight,
 * while still catching the day they do go in.
 */
export const DECLINE_QUIET_MS = 14 * 24 * 60 * 60 * 1000;

export type PendingChoice = { barId: string; barName: string };

/** The venues the user was asked about, nearest first. */
export type PendingVenue = {
  choices: PendingChoice[];
  promptedAt: number;
  notificationId?: string;
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
 * Records that the user said they are not at the venues they were asked about.
 * Turning a prompt down is the clearest signal the app gets that a venue is
 * somewhere the user passes rather than goes, so it is worth remembering for
 * much longer than an unanswered prompt.
 */
export async function declinePendingVenue(): Promise<void> {
  const pending = await getPendingVenue();
  if (pending) {
    await recordQuiet(
      DECLINED_KEY,
      pending.choices.map((choice) => choice.barId),
      DECLINE_QUIET_MS
    );
  }

  await clearPendingVenue();
}

/**
 * Forgets both quiet periods for a venue the user checked in to by hand: they
 * have just said they do go there, whatever they answered last time.
 */
export async function allowVenue(barId: string): Promise<void> {
  for (const key of [PROMPTED_KEY, DECLINED_KEY]) {
    const quiet = await readQuiet(key);
    if (quiet[barId] === undefined) continue;

    delete quiet[barId];
    await AsyncStorage.setItem(key, JSON.stringify(quiet));
  }
}

/**
 * Asks whether the user is at one of `bars` (nearest first). No venue sets a
 * status on its own, so an answered prompt is the only way one becomes a
 * check-in. Several venues in range get one notification rather than one each:
 * the phone cannot tell which of two adjacent bars you are in, so the user
 * picks from a list in the app. Venues already asked about are dropped from
 * the list rather than silencing it: a bar down the street from one you were
 * asked about earlier is a new visit, and one turned down stays quiet for a
 * fortnight. `force` re-asks inside either quiet period, for a prompt the user
 * asked for by hand.
 */
export async function promptForVenues(
  candidates: readonly Bar[],
  { force = false } = {}
): Promise<void> {
  const quiet = force
    ? candidates.map(() => false)
    : await Promise.all(candidates.map((bar) => isSuppressed(bar.id)));
  const bars = candidates.filter((_, index) => !quiet[index]);
  if (bars.length === 0) return;

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
        ? { kind: 'venue-confirm', barId: single.id }
        : { kind: 'venue-choose' },
    },
    trigger: null,
  });

  await AsyncStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ choices, promptedAt: Date.now(), notificationId } satisfies PendingVenue)
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
