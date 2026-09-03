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

export type PendingVenue = { barId: string; barName: string; promptedAt: number };

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

async function recordPrompt(barId: string): Promise<void> {
  const prompted = await readPrompted();
  const cutoff = Date.now() - PROMPT_COOLDOWN_MS;

  const kept: PromptedVenues = { [barId]: Date.now() };
  for (const [id, at] of Object.entries(prompted)) {
    if (at > cutoff) kept[id] = at;
  }

  await AsyncStorage.setItem(PROMPTED_KEY, JSON.stringify(kept));
}

export async function wasRecentlyPrompted(barId: string): Promise<boolean> {
  const prompted = await readPrompted();
  const at = prompted[barId];
  return at !== undefined && Date.now() - at < PROMPT_COOLDOWN_MS;
}

/**
 * Asks whether the user is at `bar`. No venue sets a status on its own, so an
 * answered prompt is the only way one becomes a check-in. `force` re-asks
 * inside the cooldown, for a prompt the user asked for by hand.
 */
export async function promptForVenue(bar: Bar, { force = false } = {}): Promise<void> {
  if (!force && (await wasRecentlyPrompted(bar.id))) return;

  await recordPrompt(bar.id);
  await AsyncStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ barId: bar.id, barName: bar.name, promptedAt: Date.now() } satisfies PendingVenue)
  );

  await ensureCategory();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'At the bar?',
      body: `Are you at ${bar.name}? Tap yes and your friends will see it.`,
      categoryIdentifier: VENUE_PROMPT_CATEGORY,
      data: { kind: 'venue-confirm', barId: bar.id },
    },
    trigger: null,
  });
}

/** The venue the user was last asked about and has not answered yet. */
export async function getPendingVenue(): Promise<PendingVenue | null> {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return null;

  try {
    const pending = JSON.parse(raw) as PendingVenue;
    // An unanswered prompt is stale once the cooldown that suppresses it ends.
    if (Date.now() - pending.promptedAt > PROMPT_COOLDOWN_MS) {
      await clearPendingVenue();
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

export async function clearPendingVenue(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_KEY);
}
