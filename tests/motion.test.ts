import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FIX_STALE_MS, isMoving, type Fix } from '../lib/motion.ts';

const here = { lat: 42.3798562, lng: -71.2629227 };

const fix = (
  metersNorth: number,
  at: number,
  { speedMps = null, accuracyMeters = 10 }: Partial<Omit<Fix, 'point' | 'at'>> = {}
): Fix => ({
  // A thousandth of a degree of latitude is ~111 meters.
  point: { lat: here.lat + metersNorth / 111_200, lng: here.lng },
  at,
  speedMps,
  accuracyMeters,
});

const minute = 60_000;

test('a walking pace reported by the phone is moving', () => {
  assert.equal(isMoving(null, fix(0, minute, { speedMps: 1.4 })), true);
});

test('a phone on a table is not moving', () => {
  assert.equal(isMoving(fix(0, 0), fix(0, minute, { speedMps: 0 })), false);
});

test('a block covered between two fixes is moving even with no speed', () => {
  assert.equal(isMoving(fix(0, 0), fix(90, minute)), true);
});

test('drift while sitting still is not moving', () => {
  assert.equal(isMoving(fix(0, 0), fix(25, minute)), false);
});

test('a fix that is only accurate to a street cannot prove a walk', () => {
  const previous = fix(0, 0, { accuracyMeters: 60 });

  assert.equal(isMoving(previous, fix(80, minute, { accuracyMeters: 60 })), false);
  assert.equal(isMoving(previous, fix(200, minute, { accuracyMeters: 60 })), true);
});

test('a car stopped at a light is still moving, by its speed', () => {
  assert.equal(isMoving(fix(0, 0), fix(5, minute, { speedMps: 12 })), true);
});

test('the first fix of a session is not treated as movement', () => {
  assert.equal(isMoving(null, fix(0, minute)), false);
});

test('a fix from an hour ago says nothing about the walk since', () => {
  assert.equal(isMoving(fix(0, 0), fix(5_000, FIX_STALE_MS + 1)), false);
});
