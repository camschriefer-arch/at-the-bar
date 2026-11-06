import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  answerPrompt,
  countPrompt,
  DAILY_PROMPT_CAP,
  IGNORED_PROMPT_CAP,
  IGNORED_PROMPT_GAP_MS,
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
  assert.deepEqual(one, { day: localDay(monday), count: 1, answered: 0, lastAt: monday });
  assert.equal(countPrompt(one, monday).count, 2);
  assert.equal(countPrompt(one, tuesday).count, 1);
  // A day that starts again forgets what went unanswered on the last one.
  assert.equal(countPrompt(one, tuesday).answered, 0);
  assert.equal(promptBlock(null, one, tuesday), null);
});

test('the cap holds for the day it was reached and not beyond', () => {
  const tonight = at('2026-10-12T22:00:00');
  const full = {
    day: localDay(tonight),
    count: DAILY_PROMPT_CAP,
    answered: DAILY_PROMPT_CAP,
    lastAt: tonight,
  };

  assert.equal(promptBlock(null, full, tonight), 'capped');
  assert.equal(promptBlock(null, full, at('2026-10-13T22:00:00')), null);
  assert.equal(
    promptBlock(
      null,
      { ...full, count: DAILY_PROMPT_CAP - 1, answered: DAILY_PROMPT_CAP - 1 },
      tonight
    ),
    null
  );
});

test('a prompt nobody answered is not asked again for three hours', () => {
  const asked = at('2026-10-12T19:00:00');
  const tally = countPrompt(null, asked);

  assert.equal(promptBlock(null, tally, asked + 60 * 1000), 'ignored');
  assert.equal(promptBlock(null, tally, asked + IGNORED_PROMPT_GAP_MS - 1), 'ignored');
  assert.equal(promptBlock(null, tally, asked + IGNORED_PROMPT_GAP_MS), null);
});

test('an ignored prompt leaves room for one more that day and no third', () => {
  const asked = at('2026-10-12T13:00:00');
  const later = asked + IGNORED_PROMPT_GAP_MS;
  const second = countPrompt(countPrompt(null, asked), later);

  assert.equal(second.count, IGNORED_PROMPT_CAP);
  assert.equal(promptBlock(null, second, later + IGNORED_PROMPT_GAP_MS), 'capped');
  // Answering the second one does not buy back the day's third prompt.
  assert.equal(
    promptBlock(null, answerPrompt(second, later), later + IGNORED_PROMPT_GAP_MS),
    'capped'
  );
});

test('answering keeps the usual allowance and no waiting', () => {
  const asked = at('2026-10-12T19:00:00');
  const answered = answerPrompt(countPrompt(null, asked), asked);

  assert.equal(promptBlock(null, answered, asked + 60 * 1000), null);
  assert.equal(answerPrompt(answered, asked).answered, 1, 'answers cannot outnumber prompts');
});

test('a mute silences everything until it runs out, and is then ignored', () => {
  const now = at('2026-10-12T22:00:00');
  const until = nextMorning(now);

  assert.equal(promptBlock({ until }, null, now), 'muted');
  assert.equal(promptBlock({ until }, null, until), null);
});

test('a mute outranks having prompts left', () => {
  const now = at('2026-10-12T22:00:00');
  assert.equal(
    promptBlock(
      { until: now + 1000 },
      { day: localDay(now), count: 0, answered: 0, lastAt: 0 },
      now
    ),
    'muted'
  );
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
  // A tally from before answers were counted reads as answered, so upgrading
  // mid-day does not silence someone who has been replying.
  assert.deepEqual(parseTally('{"day":"2026-10-12","count":2}'), {
    day: '2026-10-12',
    count: 2,
    answered: 2,
    lastAt: 0,
  });
  assert.deepEqual(parseTally('{"day":"2026-10-12","count":2,"answered":1,"lastAt":7}'), {
    day: '2026-10-12',
    count: 2,
    answered: 1,
    lastAt: 7,
  });
});
