import * as Notifications from 'expo-notifications';

export const STILL_HERE_CATEGORY = 'venue.stillhere';
export const STILL_HERE_YES = 'venue.stillhere.yes';
export const STILL_HERE_NO = 'venue.stillhere.no';
export const STILL_HERE_DONE = 'venue.stillhere.done';

/**
 * How long a check-in stands before the app asks whether it is still true, and
 * how many times it will ask.
 *
 * A status is normally ended by the phone noticing the user has left, which
 * needs background location. Someone who grants "While Using" never produces
 * that fix, so their check-in stands until the server expires it the next day
 * and their friends are told they are at a bar they left hours ago. These
 * prompts fire off a timer instead, so they arrive on any permission level.
 */
export const STILL_HERE_MS = 3 * 60 * 60 * 1000;

/** Stops asking once the server would have expired the status anyway. */
export const STILL_HERE_ASKS = 4;

let categoryRegistered = false;

async function ensureCategory(): Promise<void> {
  if (categoryRegistered) return;

  await Notifications.setNotificationCategoryAsync(STILL_HERE_CATEGORY, [
    {
      identifier: STILL_HERE_YES,
      buttonTitle: 'Yes, still here',
      // Saying nothing changed changes nothing, so the app can stay closed.
      options: { opensAppToForeground: false },
    },
    {
      identifier: STILL_HERE_NO,
      buttonTitle: 'No, I left',
      // Both of these end the visit on the server, so the app has to come up.
      options: { opensAppToForeground: true },
    },
    {
      identifier: STILL_HERE_DONE,
      buttonTitle: 'Done for the night',
      options: { opensAppToForeground: true },
    },
  ]);

  categoryRegistered = true;
}

/**
 * Asks, every few hours from now, whether the user is still at `barName`. They
 * are scheduled all at once because the app may never run again in between: a
 * backgrounded phone cannot arm the next question after answering this one, and
 * "Yes, still here" deliberately does not wake it. Answering No or Done cancels
 * the rest.
 */
export async function askLaterIfStillHere(barId: string, barName: string): Promise<void> {
  await stopAskingIfStillHere();
  await ensureCategory();

  for (let ask = 1; ask <= STILL_HERE_ASKS; ask += 1) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${STILL_HERE_CATEGORY}.${ask}`,
      content: {
        title: 'Still at the bar?',
        body: `Your friends still see you at ${barName}. Are you still there?`,
        categoryIdentifier: STILL_HERE_CATEGORY,
        data: { kind: 'venue-still-here', barId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: (STILL_HERE_MS / 1000) * ask,
      },
    });
  }
}

/** Takes back every unanswered question, for a visit that has ended. */
export async function stopAskingIfStillHere(): Promise<void> {
  for (let ask = 1; ask <= STILL_HERE_ASKS; ask += 1) {
    const identifier = `${STILL_HERE_CATEGORY}.${ask}`;
    await Notifications.cancelScheduledNotificationAsync(identifier);
    await Notifications.dismissNotificationAsync(identifier);
  }
}
