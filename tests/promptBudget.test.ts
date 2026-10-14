import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  countPrompt,
  DAILY_PROMPT_CAP,
  localDay,
  MORNING_HOUR,
  nextMorning,
  parseMute,
  parseTally,
  promptBlock,
} from '../lib/promptBudget.ts';

const at = (iso: string) => new Date(iso).getTime();

test('a night that is still going ends at the coming morning', () => {
  const morning = new Date(nextMorning(at('2026-10-14T23:30:00')));
  assert.equal(morning.getHours(), MORNING_HOUR);
  assert.equal(morning.getDate(), 15);
});

test('the small hours still belong to the night before', () => {
  const morning = new Date(nextMorning(at('2026-10-15T02:00:00')));
  assert.equal(morning.getDate(), 15);
  assert.equal(morning.getHours(), MORNING_HOUR);
});

test('a mute asked for in the morning runs to the next one, not minutes', () => {
  const now = at('2026-10-15T06:00:00');
  assert.ok(nextMorning(now) - now >= 23 * 60 * 60 * 1000);
});

test('prompts are counted per day and start again on the next', () => {
  const monday = at('2026-10-12T20:00:00');
  const tuesday = at('2026-10-13T20:00:00');

  const one = countPrompt(null, monday);
  assert.deepEqual(one, { day: localDay(monday), count: 1 });
  assert.equal(countPrompt(one, monday).count, 2);
  assert.equal(countPrompt(one, tuesday).count, 1);
});

test('the cap holds for the day it was reached and not beyond', () => {
  const tonight = at('2026-10-12T22:00:00');
  const full = { day: localDay(tonight), count: DAILY_PROMPT_CAP };

  assert.equal(promptBlock(null, full, tonight), 'capped');
  assert.equal(promptBlock(null, full, at('2026-10-13T22:00:00')), null);
  assert.equal(promptBlock(null, { ...full, count: DAILY_PROMPT_CAP - 1 }, tonight), null);
});

test('a mute silences everything until it runs out, and is then ignored', () => {
  const now = at('2026-10-12T22:00:00');
  const until = nextMorning(now);

  assert.equal(promptBlock({ until }, null, now), 'muted');
  assert.equal(promptBlock({ until }, null, until), null);
});

test('a mute outranks having prompts left', () => {
  const now = at('2026-10-12T22:00:00');
  assert.equal(promptBlock({ until: now + 1000 }, { day: localDay(now), count: 0 }, now), 'muted');
});

test('nothing stored means nothing is in the way', () => {
  assert.equal(promptBlock(null, null, at('2026-10-12T22:00:00')), null);
});

test('unreadable stored state is read as none of it', () => {
  assert.equal(parseMute('not json'), null);
  assert.equal(parseMute('{"until":"soon"}'), null);
  assert.equal(parseTally('{"day":"2026-10-12"}'), null);
  assert.equal(parseTally(null), null);
  assert.deepEqual(parseMute('{"until":5}'), { until: 5 });
  assert.deepEqual(parseTally('{"day":"2026-10-12","count":2}'), { day: '2026-10-12', count: 2 });
});
