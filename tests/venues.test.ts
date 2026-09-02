import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Bar, VenueCategory } from '../lib/types.ts';
import { resolveVenueAt, restaurantToConfirm } from '../lib/venues.ts';

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
