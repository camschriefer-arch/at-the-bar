import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatBarSubtitle, rankBarSuggestions, type BarSuggestion } from '../lib/barSearch.ts';
import type { Bar } from '../lib/types.ts';

const bar = (id: string, name: string): Bar => ({
  id,
  name,
  street: null,
  city: 'New York',
  state: 'NY',
  lat: 40.734,
  lng: -73.9857,
});

const near = (id: string, name: string, meters: number): BarSuggestion => ({
  bar: bar(id, name),
  distanceMeters: meters,
});

test('nearby matches outrank catalog matches', () => {
  const suggestions = rankBarSuggestions(
    'tap',
    [near('near', 'The Tap Room', 300)],
    [bar('far', 'Tap House')],
    5
  );

  assert.deepEqual(
    suggestions.map((s) => s.bar.id),
    ['near', 'far']
  );
});

test('a name starting with the query outranks one merely containing it', () => {
  const suggestions = rankBarSuggestions(
    'tap',
    [near('contains', 'The Tap Room', 10), near('starts', 'Tap Room', 900)],
    [],
    5
  );

  assert.deepEqual(
    suggestions.map((s) => s.bar.id),
    ['starts', 'contains']
  );
});

test('an empty query lists nearby bars closest first', () => {
  const suggestions = rankBarSuggestions('', [near('far', 'Anchor', 900), near('close', 'Beacon', 80)], [], 5);

  assert.deepEqual(
    suggestions.map((s) => s.bar.id),
    ['close', 'far']
  );
});

test('bars whose name misses the query are dropped', () => {
  const suggestions = rankBarSuggestions('tap', [near('a', 'Anchor', 10)], [bar('b', 'Beacon')], 5);

  assert.deepEqual(suggestions, []);
});

test('remote duplicates of a nearby bar are dropped and the limit is honoured', () => {
  const suggestions = rankBarSuggestions(
    'tap',
    [near('a', 'Tap A', 10), near('b', 'Tap B', 20)],
    [bar('a', 'Tap A')],
    1
  );

  assert.deepEqual(
    suggestions.map((s) => s.bar.id),
    ['a']
  );
});

test('subtitles show distance for nearby bars and place alone otherwise', () => {
  assert.equal(formatBarSubtitle(near('a', 'Tap A', 80)), '80 m · New York, NY');
  assert.equal(formatBarSubtitle(near('a', 'Tap A', 2253)), '1.4 mi · New York, NY');
  assert.equal(
    formatBarSubtitle({ bar: bar('b', 'Tap B'), distanceMeters: null }),
    'New York, NY'
  );
});
