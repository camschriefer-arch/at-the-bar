export const AT_BAR_RADIUS_MILES = 0.05;
export const AT_BAR_RADIUS_METERS = AT_BAR_RADIUS_MILES * 1609.344;

/**
 * Size of the coarse tile the client asks the server for. The device never
 * sends its precise position: it rounds down to a tile and filters locally.
 */
export const TILE_DEGREES = 0.02;

/**
 * How far outside its tile a request reaches, so a device at a tile edge still
 * sees venues just over the boundary. ~550 m covers the check-in radius several
 * times over without pulling in a city's worth of restaurants.
 */
export const TILE_PADDING_DEGREES = 0.005;

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
export function tileKey(point: LatLng): string {
  const lat = Math.floor(point.lat / TILE_DEGREES);
  const lng = Math.floor(point.lng / TILE_DEGREES);
  return `${lat}:${lng}`;
}

/** The tile containing `point`, padded on each side. */
export function tileBoundingBox(point: LatLng): BoundingBox {
  const lat = Math.floor(point.lat / TILE_DEGREES) * TILE_DEGREES;
  const lng = Math.floor(point.lng / TILE_DEGREES) * TILE_DEGREES;

  return {
    minLat: lat - TILE_PADDING_DEGREES,
    minLng: lng - TILE_PADDING_DEGREES,
    maxLat: lat + TILE_DEGREES + TILE_PADDING_DEGREES,
    maxLng: lng + TILE_DEGREES + TILE_PADDING_DEGREES,
  };
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
