/**
 * The home the user marked, kept in local storage on this phone and nowhere
 * else. The rules about it live in home.ts; this is only where it is held.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LatLng } from './geo';
import { isAtHome, parseHome, type Home } from './home';

const HOME_KEY = 'atb:home';

export async function getHome(): Promise<Home | null> {
  return parseHome(await AsyncStorage.getItem(HOME_KEY));
}

/** Remembers this spot as home, replacing whatever was there before. */
export async function setHome(point: LatLng): Promise<Home> {
  const home: Home = { lat: point.lat, lng: point.lng, setAt: Date.now() };
  await AsyncStorage.setItem(HOME_KEY, JSON.stringify(home));
  return home;
}

export async function clearHome(): Promise<void> {
  await AsyncStorage.removeItem(HOME_KEY);
}

/** Whether the user is at home right now, for a point the caller already has. */
export async function atHome(point: LatLng): Promise<boolean> {
  return isAtHome(await getHome(), point);
}
