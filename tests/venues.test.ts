import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Bar, VenueCategory } from '../lib/types.ts';
import { DWELL_MS, noteSighting, resolveVenueAt, restaurantToConfirm } from '../lib/venues.ts';

const here = { lat: 42.3798562, lng: -71.2629227 };

const venue = (
  id: string,
  category: VenueCategory,
  metersNorth: number
): Bar => ({
  id,
  name: id,
  street: null,
  city: 'Waltham',
  state: 'MA',
  // A thousandth of a degree of latitude is ~111 meters.
  lat: here.lat + metersNorth / 111_200,
  lng: here.lng,
  category,
});

test('the nearest bar checks a user in', () => {
  const bars = [venue('far', 'bar', 60), venue('near', 'pub', 10)];

  assert.equal(resolveVenueAt(here, bars, null)?.id, 'near');
});

test('a restaurant never checks a user in on its own', () => {
  const venues = [venue('jakes', 'restaurant', 5)];

  assert.equal(resolveVenueAt(here, venues, null), null);
  assert.equal(restaurantToConfirm(here, venues)?.id, 'jakes');
});

test('a confirmed restaurant stays the status while the user is near it', () => {
  const venues = [venue('jakes', 'restaurant', 100), venue('pub', 'bar', 70)];

  // 100 m is past the check-in radius but inside the leave radius.
  assert.equal(resolveVenueAt(here, venues, 'jakes')?.id, 'jakes');
  assert.equal(resolveVenueAt(here, venues, null)?.id, 'pub');
});

test('leaving a confirmed restaurant clears the status', () => {
  const venues = [venue('jakes', 'restaurant', 300)];

  assert.equal(resolveVenueAt(here, venues, 'jakes'), null);
});

test('a nearby bar is not asked about', () => {
  assert.equal(restaurantToConfirm(here, [venue('pub', 'pub', 10)]), null);
});

test('only a restaurant within the check-in radius is asked about', () => {
  assert.equal(restaurantToConfirm(here, [venue('jakes', 'restaurant', 300)]), null);
});

test('a first sighting starts the clock and counts for nothing', () => {
  const { sighting, dwelled } = noteSighting(null, 'jakes', 1_000);

  assert.equal(dwelled, false);
  assert.deepEqual(sighting, { barId: 'jakes', since: 1_000 });
});

test('walking past for less than the dwell never counts', () => {
  const first = noteSighting(null, 'jakes', 0).sighting;

  assert.equal(noteSighting(first, 'jakes', DWELL_MS - 1).dwelled, false);
  assert.equal(noteSighting(first, 'jakes', DWELL_MS).dwelled, true);
});

test('moving to another venue restarts the clock', () => {
  const first = noteSighting(null, 'jakes', 0).sighting;
  const second = noteSighting(first, 'pub', DWELL_MS).sighting;

  assert.deepEqual(second, { barId: 'pub', since: DWELL_MS });
  assert.equal(noteSighting(second, 'pub', DWELL_MS + 1).dwelled, false);
});

test('a clock from the future is restarted rather than trusted', () => {
  const skewed = { barId: 'jakes', since: 10_000 };

  assert.deepEqual(noteSighting(skewed, 'jakes', 1_000).sighting, { barId: 'jakes', since: 1_000 });
});
