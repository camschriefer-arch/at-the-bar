import assert from 'node:assert/strict';
import { test } from 'node:test';

import { inviteToken } from '../lib/inviteToken.ts';

test('a bare code is used as is', () => {
  assert.equal(inviteToken('  abc123  '), 'abc123');
});

test('a pasted invite link is reduced to its token', () => {
  assert.equal(inviteToken('atthebar:///redeem?token=abc123'), 'abc123');
  assert.equal(inviteToken('Join me on At The Bar: exp://1.2.3.4/--/redeem?token=abc123'), 'abc123');
});

test('other query parameters are left out of the token', () => {
  assert.equal(inviteToken('https://atthebar.app/redeem?from=cam&token=abc123&x=1'), 'abc123');
});
