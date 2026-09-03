import assert from 'node:assert/strict';
import { test } from 'node:test';

import { failureMessage } from '../lib/failureMessage.ts';

test('a PostgrestError keeps the message the database raised', () => {
  const postgrestError = { code: 'P0001', message: 'cannot accept your own invite', details: null };

  assert.equal(failureMessage(postgrestError, 'fallback'), 'cannot accept your own invite');
});

test('an Error keeps its message', () => {
  assert.equal(failureMessage(new Error('network down'), 'fallback'), 'network down');
});

test('anything without a usable message falls back', () => {
  assert.equal(failureMessage(null, 'fallback'), 'fallback');
  assert.equal(failureMessage('boom', 'fallback'), 'fallback');
  assert.equal(failureMessage({ message: '  ' }, 'fallback'), 'fallback');
});
