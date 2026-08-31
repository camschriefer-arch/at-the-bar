import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { BACKGROUND_LOCATION_TASK } from './backgroundLocationTask';
import { AT_BAR_RADIUS_METERS } from './geo';

export type PermissionLevel = 'denied' | 'foreground' | 'background';

export async function requestLocationPermissions(): Promise<PermissionLevel> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return 'denied';

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
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: AT_BAR_RADIUS_METERS / 2,
    timeInterval: Platform.OS === 'android' ? 60_000 : undefined,
    pausesUpdatesAutomatically: true,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: 'At The Bar',
      notificationBody: 'Checking whether you are at a bar',
    },
  });
}

export async function stopBackgroundUpdates(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

export async function getCurrentPoint(): Promise<{ lat: number; lng: number }> {
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return { lat: position.coords.latitude, lng: position.coords.longitude };
}
