import assert from 'node:assert/strict';
import test from 'node:test';

import { confirmedNames, nameList, pendingNames, withCompanion } from '../lib/companionText.ts';

const companions = [
  { user_id: 'a', display_name: 'Warren', pending: false },
  { user_id: 'b', display_name: 'Pete', pending: true },
  { user_id: 'c', display_name: 'Sam', pending: false },
];

test('reads a list the way it is said out loud', () => {
  assert.equal(nameList([]), '');
  assert.equal(nameList(['Warren']), 'Warren');
  assert.equal(nameList(['Warren', 'Pete']), 'Warren and Pete');
  assert.equal(nameList(['Warren', 'Pete', 'Sam']), 'Warren, Pete and Sam');
});

test('separates who has said yes from who has not answered', () => {
  assert.deepEqual(confirmedNames(companions), ['Warren', 'Sam']);
  assert.deepEqual(pendingNames(companions), ['Pete']);
});

test('joining keeps whoever the visit already names', () => {
  assert.deepEqual(withCompanion(companions, 'd'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(withCompanion([], 'd'), ['d']);
});

test('joining twice is still one claim', () => {
  assert.deepEqual(withCompanion(companions, 'b'), ['a', 'b', 'c']);
});
