import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Bar, VenueCategory } from '../lib/types.ts';
import {
  DWELL_MS,
  isQuiet,
  MAX_CHOICES,
  noteQuiet,
  noteSighting,
  parseSighting,
  SIGHTING_GAP_MS,
  stillAt,
  venuesToConfirm,
} from '../lib/venues.ts';

const HOUR = 60 * 60 * 1000;

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
  assert.deepEqual(venuesToConfirm(here, [venue('pub', 'pub', 400)]), []);
});

test('the list of venues to pick from is capped', () => {
  const venues = Array.from({ length: MAX_CHOICES + 3 }, (_, i) =>
    venue(`bar-${i}`, 'bar', i * 5)
  );

  assert.equal(venuesToConfirm(here, venues).length, MAX_CHOICES);
});

test('a confirmed venue stays the status while the user is near it', () => {
  const venues = [venue('jakes', 'restaurant', 200), venue('pub', 'bar', 10)];

  // 200 m is past the check-in radius but inside the leave radius, and a
  // closer bar does not take over a confirmed status.
  assert.equal(stillAt(here, venues, 'jakes')?.id, 'jakes');
});

test('leaving a confirmed venue clears the status', () => {
  const venues = [venue('jakes', 'restaurant', 400)];

  assert.equal(stillAt(here, venues, 'jakes'), null);
});

test('a first sighting starts the clock and counts for nothing', () => {
  const { sighting, dwelled } = noteSighting(null, ['jakes'], 1_000);

  assert.deepEqual(dwelled, []);
  assert.deepEqual(sighting, { jakes: { since: 1_000, last: 1_000 } });
});

test('walking past for less than the dwell never counts', () => {
  const first = noteSighting(null, ['jakes'], 0).sighting;

  assert.deepEqual(noteSighting(first, ['jakes'], DWELL_MS - 1).dwelled, []);
  assert.deepEqual(noteSighting(first, ['jakes'], DWELL_MS).dwelled, ['jakes']);
});

test('a neighbour drifting in and out does not restart the clock', () => {
  const first = noteSighting(null, ['jakes', 'pub'], 0).sighting;
  const second = noteSighting(first, ['jakes'], DWELL_MS / 2).sighting;

  assert.deepEqual(second, { jakes: { since: 0, last: DWELL_MS / 2 } });
  assert.deepEqual(noteSighting(second, ['jakes', 'pub'], DWELL_MS).dwelled, ['jakes']);
});

test('a venue only just in range is not carried by a neighbour that dwelled', () => {
  const first = noteSighting(null, ['jakes'], 0).sighting;

  assert.deepEqual(noteSighting(first, ['jakes', 'pub'], DWELL_MS).dwelled, ['jakes']);
});

test('moving to another venue restarts the clock', () => {
  const first = noteSighting(null, ['jakes'], 0).sighting;
  const second = noteSighting(first, ['pub'], DWELL_MS).sighting;

  assert.deepEqual(second, { pub: { since: DWELL_MS, last: DWELL_MS } });
  assert.deepEqual(noteSighting(second, ['pub'], DWELL_MS + 1).dwelled, []);
});

test('a gap in sightings ends the stay rather than satisfying the dwell', () => {
  const first = noteSighting(null, ['jakes'], 0).sighting;
  const later = SIGHTING_GAP_MS + 1;

  // The app hears nothing while iOS has the task suspended, so the fix it gets
  // on reopening starts a new stay instead of closing an hours-old one.
  const second = noteSighting(first, ['jakes'], later);
  assert.deepEqual(second.dwelled, []);
  assert.deepEqual(second.sighting, { jakes: { since: later, last: later } });
});

test('a clock from the future is restarted rather than trusted', () => {
  assert.deepEqual(
    noteSighting({ jakes: { since: 10_000, last: 10_000 } }, ['jakes'], 1_000).sighting,
    { jakes: { since: 1_000, last: 1_000 } }
  );
});

test('a sighting written before stays were timed out is not trusted', () => {
  assert.deepEqual(parseSighting(JSON.stringify({ jakes: 0 })), {});
  assert.deepEqual(parseSighting('not json'), null);
  assert.deepEqual(parseSighting(JSON.stringify({ jakes: { since: 0, last: 5 } })), {
    jakes: { since: 0, last: 5 },
  });
});

test('a venue stays quiet for its period and speaks up after it', () => {
  const quiet = noteQuiet(null, ['jakes'], 0, 6 * HOUR);

  assert.equal(isQuiet(quiet, 'jakes', 5 * HOUR, 6 * HOUR), true);
  assert.equal(isQuiet(quiet, 'jakes', 6 * HOUR, 6 * HOUR), false);
  assert.equal(isQuiet(quiet, 'pub', 0, 6 * HOUR), false);
});

test('quieting one venue neither restarts nor forgets another still running', () => {
  const first = noteQuiet(null, ['jakes', 'pub'], 0, 6 * HOUR);
  const second = noteQuiet(first, ['jakes'], 3 * HOUR, 6 * HOUR);

  assert.deepEqual(second, { jakes: 3 * HOUR, pub: 0 });
});

test('venues whose quiet period ran out are dropped rather than kept forever', () => {
  const first = noteQuiet(null, ['pub'], 0, 6 * HOUR);

  assert.deepEqual(noteQuiet(first, ['jakes'], 7 * HOUR, 6 * HOUR), { jakes: 7 * HOUR });
});
