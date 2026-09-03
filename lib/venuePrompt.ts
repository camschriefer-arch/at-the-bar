import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import type { Bar } from './types';

export const VENUE_PROMPT_CATEGORY = 'venue.confirm';
export const VENUE_PROMPT_CONFIRM = 'venue.confirm.yes';
export const VENUE_PROMPT_DISMISS = 'venue.confirm.no';

const PENDING_KEY = 'atb:pendingVenue';
const PROMPTED_KEY = 'atb:promptedVenues';

/**
 * A venue is only asked about once per visit: long enough that walking past the
 * same bar twice in an evening does not nag, short enough that going back the
 * next day asks again.
 */
const PROMPT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export type PendingChoice = { barId: string; barName: string };

/** The venues the user was asked about, nearest first. */
export type PendingVenue = {
  choices: PendingChoice[];
  promptedAt: number;
  notificationId?: string;
};

type PromptedVenues = Record<string, number>;

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

async function readPrompted(): Promise<PromptedVenues> {
  const raw = await AsyncStorage.getItem(PROMPTED_KEY);
  if (!raw) return {};

  try {
    return JSON.parse(raw) as PromptedVenues;
  } catch {
    return {};
  }
}

async function recordPrompts(barIds: readonly string[]): Promise<void> {
  const prompted = await readPrompted();
  const now = Date.now();
  const cutoff = now - PROMPT_COOLDOWN_MS;

  const kept: PromptedVenues = Object.fromEntries(barIds.map((id) => [id, now]));
  for (const [id, at] of Object.entries(prompted)) {
    if (at > cutoff && kept[id] === undefined) kept[id] = at;
  }

  await AsyncStorage.setItem(PROMPTED_KEY, JSON.stringify(kept));
}

export async function wasRecentlyPrompted(barId: string): Promise<boolean> {
  const prompted = await readPrompted();
  const at = prompted[barId];
  return at !== undefined && Date.now() - at < PROMPT_COOLDOWN_MS;
}

/**
 * Asks whether the user is at one of `bars` (nearest first). No venue sets a
 * status on its own, so an answered prompt is the only way one becomes a
 * check-in. Several venues in range get one notification rather than one each:
 * the phone cannot tell which of two adjacent bars you are in, so the user
 * picks from a list in the app. `force` re-asks inside the cooldown, for a
 * prompt the user asked for by hand.
 */
export async function promptForVenues(bars: readonly Bar[], { force = false } = {}): Promise<void> {
  if (bars.length === 0) return;
  // Asking again about any one of them would land on the same list.
  if (!force && (await Promise.all(bars.map((bar) => wasRecentlyPrompted(bar.id)))).some(Boolean)) {
    return;
  }

  await recordPrompts(bars.map((bar) => bar.id));
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
