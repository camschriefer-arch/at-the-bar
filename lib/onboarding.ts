import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCATION_INTRO_KEY = 'atb:location-intro';

/**
 * Whether the location explainer has been shown. iOS grants its one Always
 * prompt per install, so it is only worth spending after the user has been
 * told what it buys them.
 */
export async function hasSeenLocationIntro(): Promise<boolean> {
  return (await AsyncStorage.getItem(LOCATION_INTRO_KEY)) === 'seen';
}

export async function markLocationIntroSeen(): Promise<void> {
  await AsyncStorage.setItem(LOCATION_INTRO_KEY, 'seen');
}

// Deliberately in memory only: "Not now" holds for the rest of the time the
// app is open and the reminder returns on the next launch.
let reminderSnoozed = false;

export function snoozeLocationReminder(): void {
  reminderSnoozed = true;
}

export function clearLocationReminderSnooze(): void {
  reminderSnoozed = false;
}

export function isLocationReminderSnoozed(): boolean {
  return reminderSnoozed;
}
