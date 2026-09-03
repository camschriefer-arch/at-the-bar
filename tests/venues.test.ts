import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Bar, VenueCategory } from '../lib/types.ts';
import { DWELL_MS, noteSighting, stillAt, venueToConfirm } from '../lib/venues.ts';

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

test('no venue checks a user in on its own', () => {
  const venues = [venue('pub', 'pub', 5), venue('jakes', 'restaurant', 8)];

  assert.equal(stillAt(here, venues, null), null);
});

test('the nearest venue of any category is the one asked about', () => {
  const venues = [venue('far', 'bar', 60), venue('jakes', 'restaurant', 10)];

  assert.equal(venueToConfirm(here, venues)?.id, 'jakes');
});

test('only a venue within the check-in radius is asked about', () => {
  assert.equal(venueToConfirm(here, [venue('pub', 'pub', 300)]), null);
});

test('a confirmed venue stays the status while the user is near it', () => {
  const venues = [venue('jakes', 'restaurant', 100), venue('pub', 'bar', 10)];

  // 100 m is past the check-in radius but inside the leave radius, and a
  // closer bar does not take over a confirmed status.
  assert.equal(stillAt(here, venues, 'jakes')?.id, 'jakes');
});

test('leaving a confirmed venue clears the status', () => {
  const venues = [venue('jakes', 'restaurant', 300)];

  assert.equal(stillAt(here, venues, 'jakes'), null);
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
