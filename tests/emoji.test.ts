import assert from 'node:assert/strict';
import test from 'node:test';

import { asReaction } from '../lib/emoji.ts';

test('takes any emoji off the keyboard, however many pieces it is in', () => {
  assert.equal(asReaction('🦄'), '🦄');
  assert.equal(asReaction('👍🏽'), '👍🏽');
  assert.equal(asReaction('🇮🇪'), '🇮🇪');
  assert.equal(asReaction('❤️'), '❤️');
  assert.equal(asReaction(' 🍺 '), '🍺');
});

test('turns away anything that is a comment rather than a reaction', () => {
  assert.equal(asReaction(''), null);
  assert.equal(asReaction('   '), null);
  assert.equal(asReaction('nice'), null);
  assert.equal(asReaction('🍺 cheers'), null);
  assert.equal(asReaction('!!'), null);
  assert.equal(asReaction('🍺🍺🍺🍺🍺🍺🍺🍺🍺'), null);
});
