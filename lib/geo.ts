/**
 * Wide enough to absorb the GPS error a phone has indoors, which is tens of
 * metres on its own. Nothing is shared without the user confirming, so a venue
 * offered from across the street costs them a dismissal, not their privacy.
 */
export const AT_BAR_RADIUS_MILES = 0.1;
export const AT_BAR_RADIUS_METERS = AT_BAR_RADIUS_MILES * 1609.344;

/**
 * The tile sizes the client asks the server for, coarsest first. The device
 * never sends its precise position: it rounds down to a tile and filters
 * locally. `padding` is how far outside its tile a request reaches, so a
 * device at a tile edge still sees venues just over the boundary; both
 * paddings clear the check-in radius several times over.
 *
 * A tile of a dense city holds more venues than the server will return, and
 * the ones it drops are the ones furthest from the tile centre — which can be
 * the ones the user is standing in. So a tile that comes back full is asked
 * for again at the finer size, where even central Manhattan fits.
 */
export type TileSize = { degrees: number; padding: number };

export const COARSE_TILE: TileSize = { degrees: 0.02, padding: 0.005 };
export const FINE_TILE: TileSize = { degrees: 0.005, padding: 0.004 };
export const TILE_SIZES: readonly TileSize[] = [COARSE_TILE, FINE_TILE];

const EARTH_RADIUS_METERS = 6371008.8;

export type LatLng = { lat: number; lng: number };

export type BoundingBox = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Identifier of the tile a point falls in, used as the bar cache key. */
export function tileKey(point: LatLng, size: TileSize = COARSE_TILE): string {
  const lat = Math.floor(point.lat / size.degrees);
  const lng = Math.floor(point.lng / size.degrees);
  return `${size.degrees}:${lat}:${lng}`;
}

/** The tile containing `point`, padded on each side. */
export function tileBoundingBox(point: LatLng, size: TileSize = COARSE_TILE): BoundingBox {
  const lat = Math.floor(point.lat / size.degrees) * size.degrees;
  const lng = Math.floor(point.lng / size.degrees) * size.degrees;

  return {
    minLat: lat - size.padding,
    minLng: lng - size.padding,
    maxLat: lat + size.degrees + size.padding,
    maxLng: lng + size.degrees + size.padding,
  };
}

/** Everything inside `radiusMeters`, nearest first. */
export function allWithin<T extends LatLng>(
  point: LatLng,
  candidates: readonly T[],
  radiusMeters: number = AT_BAR_RADIUS_METERS
): T[] {
  return candidates
    .map((item) => ({ item, meters: distanceMeters(point, item) }))
    .filter(({ meters }) => meters <= radiusMeters)
    .sort((a, b) => a.meters - b.meters)
    .map(({ item }) => item);
}

export function nearestWithin<T extends LatLng>(
  point: LatLng,
  candidates: readonly T[],
  radiusMeters: number = AT_BAR_RADIUS_METERS
): { item: T; distanceMeters: number } | null {
  let best: { item: T; distanceMeters: number } | null = null;

  for (const candidate of candidates) {
    const meters = distanceMeters(point, candidate);
    if (meters <= radiusMeters && (best === null || meters < best.distanceMeters)) {
      best = { item: candidate, distanceMeters: meters };
    }
  }

  return best;
}
