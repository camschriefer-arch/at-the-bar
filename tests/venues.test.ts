import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Bar, VenueCategory } from '../lib/types.ts';
import {
  DWELL_MS,
  MAX_CHOICES,
  noteSighting,
  sightingKey,
  stillAt,
  venuesToConfirm,
} from '../lib/venues.ts';

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

test('every venue in range is asked about, of any category, nearest first', () => {
  const venues = [venue('far', 'bar', 40), venue('jakes', 'restaurant', 10)];

  assert.deepEqual(
    venuesToConfirm(here, venues).map((v) => v.id),
    ['jakes', 'far']
  );
});

test('only venues within the check-in radius are asked about', () => {
  assert.deepEqual(venuesToConfirm(here, [venue('pub', 'pub', 300)]), []);
});

test('the list of venues to pick from is capped', () => {
  const venues = Array.from({ length: MAX_CHOICES + 3 }, (_, i) =>
    venue(`bar-${i}`, 'bar', i * 5)
  );

  assert.equal(venuesToConfirm(here, venues).length, MAX_CHOICES);
});

test('the dwell clock ignores which of the nearby venues is closest', () => {
  const a = venue('a', 'bar', 10);
  const b = venue('b', 'pub', 20);

  assert.equal(sightingKey([a, b]), sightingKey([b, a]));
  assert.notEqual(sightingKey([a, b]), sightingKey([a]));
});

test('a confirmed venue stays the status while the user is near it', () => {
  const venues = [venue('jakes', 'restaurant', 60), venue('pub', 'bar', 10)];

  // 60 m is past the check-in radius but inside the leave radius, and a
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
