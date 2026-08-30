import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';
import { tileBoundingBox, tileKey, type LatLng } from './geo';
import type { Bar } from './types';

const CACHE_PREFIX = 'atb:bars:';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CachedTile = { fetchedAt: number; bars: Bar[] };

async function readTile(key: string): Promise<CachedTile | null> {
  const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CachedTile;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Bars around `point`, from the local cache when possible. Only the coarse tile
 * the point falls in is sent to the server, never the point itself.
 */
export async function barsNear(point: LatLng): Promise<Bar[]> {
  const key = tileKey(point);
  const cached = await readTile(key);
  if (cached) return cached.bars;

  const box = tileBoundingBox(point);
  const { data, error } = await supabase.rpc('bars_in_bbox', {
    min_lat: box.minLat,
    min_lng: box.minLng,
    max_lat: box.maxLat,
    max_lng: box.maxLng,
  });

  if (error) throw error;

  const bars = (data ?? []) as Bar[];
  await AsyncStorage.setItem(
    CACHE_PREFIX + key,
    JSON.stringify({ fetchedAt: Date.now(), bars } satisfies CachedTile)
  );

  return bars;
}

export async function clearBarCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const ours = keys.filter((key) => key.startsWith(CACHE_PREFIX));
  if (ours.length > 0) await AsyncStorage.multiRemove(ours);
}
