import assert from 'node:assert/strict';
import test from 'node:test';

import { HOME_RADIUS_METERS, isAtHome, parseHome, type Home } from '../lib/home.ts';

const home: Home = { lat: 42.3601, lng: -71.0589, setAt: 0 };

/** A point `meters` due north of `home`. */
const north = (meters: number) => ({
  lat: home.lat + meters / 111_320,
  lng: home.lng,
});

test('the bar downstairs is at home', () => {
  assert.equal(isAtHome(home, north(40)), true);
});

test('a bar a quarter mile away is not', () => {
  assert.equal(isAtHome(home, north(HOME_RADIUS_METERS + 50)), false);
});

test('no home marked silences nothing', () => {
  assert.equal(isAtHome(null, home), false);
});

test('a home written by an older build still reads', () => {
  assert.deepEqual(parseHome('{"lat":42.36,"lng":-71.06}'), {
    lat: 42.36,
    lng: -71.06,
    setAt: 0,
  });
});

test('nonsense in storage is no home at all', () => {
  assert.equal(parseHome('not json'), null);
  assert.equal(parseHome('{"lat":"here"}'), null);
  assert.equal(parseHome(null), null);
});
