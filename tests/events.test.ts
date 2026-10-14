import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DISTANCE_STEP_METERS, eventRow } from '../lib/events.ts';

test('an event with nothing measured is just the event', () => {
  assert.deepEqual(eventRow('check_in_found_nothing'), { event: 'check_in_found_nothing' });
});

test('distance is rounded so it cannot be read as a position', () => {
  assert.equal(eventRow('prompt_shown', { meters: 63.7 }).distance_meters, 60);
  assert.equal(eventRow('prompt_shown', { meters: 0.4 }).distance_meters, 0);
  assert.equal(
    eventRow('prompt_shown', { meters: DISTANCE_STEP_METERS * 1.5 }).distance_meters,
    DISTANCE_STEP_METERS * 2
  );
});

test('durations are written in whole seconds', () => {
  const row = eventRow('check_in', { dwelledMs: 5 * 60 * 1000, answeredInMs: 2400 });
  assert.equal(row.dwell_seconds, 300);
  assert.equal(row.answer_seconds, 2);
});

test('unmeasured is left out rather than written as nothing', () => {
  const row = eventRow('prompt_shown', { barId: null, dwelledMs: null, venueCount: null });
  assert.equal('bar_id' in row, false);
  assert.equal('dwell_seconds' in row, false);
  assert.equal('venue_count' in row, false);
});

test('a measured zero is still a measurement', () => {
  assert.equal(eventRow('check_in', { answeredInMs: 0 }).answer_seconds, 0);
});

test('nonsense numbers are dropped, not stored', () => {
  const row = eventRow('prompt_shown', { meters: Number.NaN, dwelledMs: Number.POSITIVE_INFINITY });
  assert.equal('distance_meters' in row, false);
  assert.equal('dwell_seconds' in row, false);
});

test('a negative clock is floored rather than stored backwards', () => {
  assert.equal(eventRow('check_in', { answeredInMs: -5000 }).answer_seconds, 0);
});

test('what the event was about is carried through', () => {
  assert.deepEqual(eventRow('check_in', { barId: 'bar-1', source: 'notification' }), {
    event: 'check_in',
    bar_id: 'bar-1',
    source: 'notification',
  });
});
