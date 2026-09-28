import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isStaleStatus, STALE_STATUS_MS } from '../lib/presence.ts';

const now = Date.parse('2026-09-28T09:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();

test('nobody is anywhere without an arrival', () => {
  assert.equal(isStaleStatus(null, now), false);
});

test('a visit that started this evening still counts', () => {
  assert.equal(isStaleStatus(ago(3 * 60 * 60 * 1000), now), false);
});

test('last night stops counting the next morning', () => {
  assert.equal(isStaleStatus(ago(STALE_STATUS_MS + 1000), now), true);
});

test('the cutoff itself is still believed', () => {
  assert.equal(isStaleStatus(ago(STALE_STATUS_MS), now), false);
});

test('an unreadable timestamp is left alone rather than expired', () => {
  assert.equal(isStaleStatus('not a date', now), false);
});
