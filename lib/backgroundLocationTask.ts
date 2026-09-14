import type { LocationObject } from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { isSharingEnabled } from './sharing';
import { syncStatusForLocation } from './statusSync';

export const BACKGROUND_LOCATION_TASK = 'atb-background-location';

type LocationTaskData = { locations?: LocationObject[] };

const positive = (value: number | null | undefined) =>
  typeof value === 'number' && value >= 0 ? value : null;

// Must be registered in the top-level scope so the task exists when the OS
// relaunches the app in the background.
TaskManager.defineTask<LocationTaskData>(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Background location error', error.message);
    return;
  }

  const latest = data?.locations?.at(-1);
  if (!latest) return;

  if (!(await isSharingEnabled())) return;

  try {
    await syncStatusForLocation(
      { lat: latest.coords.latitude, lng: latest.coords.longitude },
      {
        // Both are reported as a negative number when the platform has no
        // reading, which would otherwise read as standing perfectly still.
        speedMps: positive(latest.coords.speed),
        accuracyMeters: positive(latest.coords.accuracy),
      }
    );
  } catch (cause) {
    console.warn('Failed to sync bar status', cause);
  }
});
