import assert from 'node:assert/strict';
import test from 'node:test';

import { EMOJI_GROUPS, REACTION_EMOJIS } from '../lib/emojiSet.ts';

const offered = EMOJI_GROUPS.flatMap((group) => group.emojis);

test('offers each emoji once, so a tap always means the same chip', () => {
  assert.equal(new Set(offered).size, offered.length);
});

test('offers the emoji the chip row already shows', () => {
  for (const emoji of REACTION_EMOJIS) assert.ok(offered.includes(emoji));
});

test('offers nothing that is not an emoji', () => {
  for (const emoji of offered) {
    assert.ok(emoji.trim() === emoji && emoji.length > 0, emoji);
    for (const point of [...emoji].map((character) => character.codePointAt(0) ?? 0)) {
      assert.ok(point > 0x2000, emoji);
    }
  }
});
