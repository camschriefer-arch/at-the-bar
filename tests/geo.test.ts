import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AT_BAR_RADIUS_METERS,
  distanceMeters,
  nearestWithin,
  tileBoundingBox,
  tileKey,
} from '../lib/geo.ts';
import { LEAVE_RADIUS_METERS } from '../lib/venues.ts';

const mollys = { lat: 40.734, lng: -73.9857 };

test('0.05 miles is about 80 meters', () => {
  assert.ok(Math.abs(AT_BAR_RADIUS_METERS - 80.4672) < 0.001);
});

test('distance between a point and itself is zero', () => {
  assert.equal(distanceMeters(mollys, mollys), 0);
});

test('distance matches a known short baseline', () => {
  // One thousandth of a degree of latitude is ~111 meters anywhere on earth.
  const north = { lat: mollys.lat + 0.001, lng: mollys.lng };
  assert.ok(Math.abs(distanceMeters(mollys, north) - 111.2) < 1);
});

test('nearestWithin picks the closest bar inside the radius', () => {
  const near = { id: 'near', lat: mollys.lat + 0.0004, lng: mollys.lng };
  const nearer = { id: 'nearer', lat: mollys.lat + 0.0002, lng: mollys.lng };
  const far = { id: 'far', lat: mollys.lat + 0.01, lng: mollys.lng };

  const result = nearestWithin(mollys, [near, far, nearer]);

  assert.equal(result?.item.id, 'nearer');
});

test('nearestWithin returns null when every bar is beyond the radius', () => {
  const far = { id: 'far', lat: mollys.lat + 0.005, lng: mollys.lng };

  assert.equal(nearestWithin(mollys, [far]), null);
});

test('a wider radius keeps a bar that just went out of range', () => {
  const justOutside = { id: 'edge', lat: mollys.lat + 0.0008, lng: mollys.lng };

  assert.equal(nearestWithin(mollys, [justOutside]), null);
  assert.equal(nearestWithin(mollys, [justOutside], AT_BAR_RADIUS_METERS * 1.5)?.item.id, 'edge');
});

test('nearby points share a tile key', () => {
  assert.equal(tileKey(mollys), tileKey({ lat: mollys.lat + 0.001, lng: mollys.lng }));
});

// The box has to reach past the leave radius on every side, or a user standing
// at the edge of a tile would not see the bar they are standing in.
test('the tile bounding box clears the leave radius on each side', () => {
  const box = tileBoundingBox(mollys);

  assert.ok(box.minLat < mollys.lat && mollys.lat < box.maxLat);
  assert.ok(box.minLng < mollys.lng && mollys.lng < box.maxLng);
  assert.ok(distanceMeters({ lat: box.minLat, lng: mollys.lng }, mollys) > LEAVE_RADIUS_METERS);
});
