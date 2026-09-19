import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toVenueAddress } from '../lib/address.ts';

test('a placemark becomes the address shape the catalog stores', () => {
  assert.deepEqual(
    toVenueAddress({
      streetNumber: '214',
      street: 'Lexington St',
      city: 'Waltham',
      region: 'MA',
    }),
    { street: '214 Lexington St', city: 'Waltham', state: 'MA' }
  );
});

test('a state spelled out is stored as its postal code', () => {
  assert.equal(toVenueAddress({ region: 'Massachusetts' }).state, 'MA');
  assert.equal(toVenueAddress({ region: 'new york' }).state, 'NY');
});

test('a state that is neither is kept rather than dropped', () => {
  assert.equal(toVenueAddress({ region: 'Ontario' }).state, 'Ontario');
});

test('a street that already carries its number is not given it twice', () => {
  assert.equal(
    toVenueAddress({ streetNumber: '214', street: '214 Lexington St' }).street,
    '214 Lexington St'
  );
});

test('the town falls back to the subregion when there is no city', () => {
  assert.equal(toVenueAddress({ city: null, subregion: 'Middlesex County' }).city, 'Middlesex County');
});

test('blank parts and no placemark at all come back empty', () => {
  assert.deepEqual(toVenueAddress({ street: '  ', city: '', region: null }), {
    street: null,
    city: null,
    state: null,
  });
  assert.deepEqual(toVenueAddress(undefined), { street: null, city: null, state: null });
});
