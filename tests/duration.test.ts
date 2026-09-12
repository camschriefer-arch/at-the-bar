import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatMinutes } from '../lib/duration.ts';

test('under an hour reads in minutes', () => {
  assert.equal(formatMinutes(45), '45m');
});

test('whole hours drop the minutes', () => {
  assert.equal(formatMinutes(120), '2h');
});

test('longer visits read as hours and minutes', () => {
  assert.equal(formatMinutes(135), '2h 15m');
});

test('a visit too short to measure has no label', () => {
  assert.equal(formatMinutes(0), null);
  assert.equal(formatMinutes(null), null);
});
