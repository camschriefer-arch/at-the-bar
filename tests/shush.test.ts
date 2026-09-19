import assert from 'node:assert/strict';
import test from 'node:test';

import { untilLabel } from '../lib/shushTime.ts';

function local(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(year, month - 1, day, hour, minute);
}

test('says the hour and that it is tomorrow', () => {
  const now = local(2026, 9, 19, 15, 40);
  const until = local(2026, 9, 20, 15, 40);
  assert.equal(untilLabel(until.toISOString(), now), '3:40pm tomorrow');
});

test('says today when it lifts before midnight', () => {
  const now = local(2026, 9, 19, 2, 0);
  const until = local(2026, 9, 19, 23, 5);
  assert.equal(untilLabel(until.toISOString(), now), '11:05pm today');
});

test('reads midnight and noon as 12', () => {
  const now = local(2026, 9, 19, 13, 0);
  assert.equal(untilLabel(local(2026, 9, 20, 0, 30).toISOString(), now), '12:30am tomorrow');
  assert.equal(untilLabel(local(2026, 9, 20, 12, 0).toISOString(), now), '12:00pm tomorrow');
});

test('falls back rather than printing an invalid date', () => {
  assert.equal(untilLabel('not a date'), 'in a day');
});
