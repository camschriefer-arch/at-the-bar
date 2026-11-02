import AsyncStorage from '@react-native-async-storage/async-storage';

import type { VenueAddress } from './address';
import { supabase } from './supabase';
import { TILE_SIZES, tileBoundingBox, tileKey, type LatLng } from './geo';
import type { Bar, VenueCategory } from './types';

const CACHE_PREFIX = 'atb:tiles:';
// Tiles cached before restaurants were added, and before a tile recorded which
// size it was fetched at: a different key format, so they are dropped rather
// than read.
const LEGACY_CACHE_PREFIXES = ['atb:bars:', 'atb:venues:'];
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Anyone can add the venue they are standing in, and only the phone that added
// it drops its own tile. A week-old tile on everybody else's phone cannot know
// about it, so a venue a friend added minutes ago is invisible to the person
// trying to join them in it. The flows a user drives by hand therefore refetch
// a tile this old rather than trusting the week-long one.
export const FRESH_TILE_MS = 60 * 1000;

// What a tile may hold before it is refetched at the finer size. The server
// returns the venues nearest the tile centre first, so a tile this full has
// dropped its own edges, where the user may well be standing.
const MAX_TILE_VENUES = 3000;

type CachedTile = { fetchedAt: number; bars: Bar[] };

async function readTile(key: string, maxAgeMs: number): Promise<CachedTile | null> {
  const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CachedTile;
    if (Date.now() - parsed.fetchedAt > maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Venues around `point`, from the local cache when possible. Only the coarse
 * tile the point falls in is sent to the server, never the point itself.
 *
 * `maxAgeMs` is how stale a cached tile may be before it is fetched again; pass
 * `FRESH_TILE_MS` where the user is waiting on the answer and a venue added
 * today has to be in it.
 */
export async function barsNear(point: LatLng, maxAgeMs: number = CACHE_TTL_MS): Promise<Bar[]> {
  // Finest first: a fine tile was only stored because the coarse one around it
  // came back full, and it is the complete answer for where the user is.
  const keys = TILE_SIZES.map((size) => tileKey(point, size)).reverse();
  for (const key of keys) {
    const cached = await readTile(key, maxAgeMs);
    if (cached) return cached.bars;
  }

  for (const [index, size] of TILE_SIZES.entries()) {
    const key = tileKey(point, size);
    const box = tileBoundingBox(point, size);
    const { data, error } = await supabase.rpc('bars_in_bbox_json', {
      min_lat: box.minLat,
      min_lng: box.minLng,
      max_lat: box.maxLat,
      max_lng: box.maxLng,
      max_rows: MAX_TILE_VENUES,
    });

    if (error) {
      // A refetch asked for freshness, not for the only copy: a bar with no
      // signal still has a usable week-old tile.
      for (const stale of keys) {
        const tile = maxAgeMs < CACHE_TTL_MS ? await readTile(stale, CACHE_TTL_MS) : null;
        if (tile) return tile.bars;
      }
      throw error;
    }

    const bars = (data ?? []) as Bar[];

    // Full, and there is a finer size to ask at: what came back is the middle
    // of the tile, which says nothing about the venue the user is in.
    const truncated = bars.length >= MAX_TILE_VENUES;
    if (truncated && index < TILE_SIZES.length - 1) continue;

    await AsyncStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ fetchedAt: Date.now(), bars } satisfies CachedTile)
    );

    return bars;
  }

  return [];
}

/**
 * One venue by id, for the two cases a tile cannot answer: a venue a friend
 * added minutes ago, and a venue dropped from a dense city's tile. Checking a
 * user in still has to clear the distance, which is measured on the device.
 */
export async function venueById(id: string): Promise<Bar | null> {
  const { data, error } = await supabase
    .from('bars')
    .select('id, name, street, city, state, lat, lng, category')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return (data as Bar | null) ?? null;
}

/**
 * Catalog-wide name search, for bars outside the cached tile. Only the typed
 * text is sent; the device's position stays local.
 */
export async function searchBarsByName(query: string, limit = 10): Promise<Bar[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const { data, error } = await supabase
    .from('bars')
    .select('id, name, street, city, state, lat, lng, category')
    .ilike('name', `%${term.replace(/[%_]/g, '\\$&')}%`)
    .order('name')
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Bar[];
}

/**
 * Puts a venue the catalog is missing into it, and returns the catalog row —
 * the one that was already there when the name matches something a few doors
 * down. The tile is dropped so the new venue is in range immediately.
 */
export async function addVenue(
  name: string,
  point: LatLng,
  category: VenueCategory,
  address: VenueAddress
): Promise<Bar> {
  const { data, error } = await supabase.rpc('add_venue', {
    p_name: name,
    p_lat: point.lat,
    p_lng: point.lng,
    p_category: category,
    p_street: address.street,
    p_city: address.city,
    p_state: address.state,
  });

  if (error) throw error;

  const [bar] = (data ?? []) as Bar[];
  if (!bar) throw new Error('Could not add that venue');

  await AsyncStorage.multiRemove(TILE_SIZES.map((size) => CACHE_PREFIX + tileKey(point, size)));
  return bar;
}

export async function clearBarCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const ours = keys.filter((key) =>
    [CACHE_PREFIX, ...LEGACY_CACHE_PREFIXES].some((prefix) => key.startsWith(prefix))
  );
  if (ours.length > 0) await AsyncStorage.multiRemove(ours);
}
