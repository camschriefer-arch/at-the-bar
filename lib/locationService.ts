import * as Location from 'expo-location';

import { BACKGROUND_LOCATION_TASK } from './backgroundLocationTask';
import { isSharingEnabled } from './sharing';

export type PermissionLevel = 'denied' | 'foreground' | 'background';

// iOS shows the "Change to Always?" upgrade dialog only once the When In Use
// one has closed; asking in the same tick loses it.
const ALWAYS_PROMPT_DELAY_MS = 700;

export async function requestLocationPermissions(): Promise<PermissionLevel> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return 'denied';

  return requestAlwaysPermission();
}

/**
 * Asks iOS to upgrade When In Use to Always. Returns 'foreground' when the
 * system refused to ask — after "Allow Once", or once the one-time upgrade
 * prompt has been answered, the request fails silently and Settings is the
 * only way left.
 */
export async function requestAlwaysPermission(): Promise<PermissionLevel> {
  await new Promise((resolve) => setTimeout(resolve, ALWAYS_PROMPT_DELAY_MS));

  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === 'granted' ? 'background' : 'foreground';
}

export async function getPermissionLevel(): Promise<PermissionLevel> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return 'denied';

  const background = await Location.getBackgroundPermissionsAsync();
  return background.status === 'granted' ? 'background' : 'foreground';
}

export async function startBackgroundUpdates(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) return;

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    // Balanced is only accurate to ~100 m, which is wider than the check-in
    // radius, so a fix has to be good enough to place a building.
    accuracy: Location.Accuracy.High,
    // Sitting still in a bar is the case that has to work, so updates cannot be
    // gated on movement: the dwell needs a second fix at the same venue three
    // minutes after the first. Time keeps the rate down instead.
    distanceInterval: 0,
    timeInterval: 60_000,
    deferredUpdatesInterval: 60_000,
    activityType: Location.LocationActivityType.Other,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: 'At The Bar',
      notificationBody: 'Checking whether you are at a bar',
    },
  });
}

/**
 * Restarts background updates if they are wanted but not running. iOS stops the
 * task when it terminates the app for memory, and nothing tells the app that
 * happened: without this a user can go a whole day never being asked about a
 * venue again.
 */
export async function resumeBackgroundUpdates(): Promise<void> {
  if (!(await isSharingEnabled())) return;
  if ((await getPermissionLevel()) !== 'background') return;

  await startBackgroundUpdates();
}

export async function stopBackgroundUpdates(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

export async function getCurrentPoint(): Promise<{ lat: number; lng: number }> {
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  return { lat: position.coords.latitude, lng: position.coords.longitude };
}
