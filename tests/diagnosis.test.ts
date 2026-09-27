import assert from 'node:assert/strict';
import test from 'node:test';

import { reportOnVenues } from '../lib/diagnosis.ts';
import { describeVenue, summarise } from '../lib/diagnosisText.ts';
import { FIX_STALE_MS, type Fix } from '../lib/motion.ts';
import { DWELL_MS } from '../lib/venues.ts';

const NOW = 1_700_000_000_000;
const HERE = { lat: 42.5, lng: -71.1 };

const jake = { id: 'jake', name: "Jake & Joe's", ...HERE };
const joe = { id: 'joe', name: 'Not Your Average Joe', lat: 42.5008, lng: -71.1 };
const away = { id: 'away', name: 'Across Town', lat: 42.6, lng: -71.1 };

const fresh: Fix = { point: HERE, at: NOW - 60_000, speedMps: 0, accuracyMeters: 10 };

const state = {
  sighting: null,
  prompted: null,
  declined: null,
  fix: fresh,
  now: NOW,
};

test('reports only what is close enough to check into, nearest first', () => {
  const report = reportOnVenues(HERE, [away, joe, jake], state);
  assert.deepEqual(
    report.map((venue) => venue.barId),
    ['jake', 'joe']
  );
});

test('says a venue is ready once its own clock has run out', () => {
  const [venue] = reportOnVenues(HERE, [jake], {
    ...state,
    sighting: { jake: { since: NOW - DWELL_MS, last: NOW - 60_000 } },
  });

  assert.equal(venue.verdict, 'asking');
});

test('says how far into the wait a venue is', () => {
  const [venue] = reportOnVenues(HERE, [jake], {
    ...state,
    sighting: { jake: { since: NOW - 2 * 60_000, last: NOW - 60_000 } },
  });

  assert.equal(venue.verdict, 'waiting');
  assert.match(describeVenue(venue), /2m of 5m/);
});

test('blames the quiet period a venue is actually in', () => {
  const [declined] = reportOnVenues(HERE, [jake], { ...state, declined: { jake: NOW - 60_000 } });
  assert.equal(declined.verdict, 'turned-down');

  const [prompted] = reportOnVenues(HERE, [jake], { ...state, prompted: { jake: NOW - 60_000 } });
  assert.equal(prompted.verdict, 'asked-already');
});

test('a quiet period that has run out no longer explains anything', () => {
  const [venue] = reportOnVenues(HERE, [jake], {
    ...state,
    declined: { jake: NOW - 15 * 24 * 60 * 60 * 1000 },
  });

  assert.equal(venue.verdict, 'waiting');
});

test('says nothing is counting when the app has not heard where the phone is', () => {
  const stale = reportOnVenues(HERE, [jake, joe], {
    ...state,
    fix: { ...fresh, at: NOW - FIX_STALE_MS - 1 },
    sighting: { jake: { since: NOW - DWELL_MS, last: NOW - DWELL_MS } },
  });

  assert.deepEqual(
    stale.map((venue) => venue.verdict),
    ['not-tracked', 'not-tracked']
  );
  assert.match(summarise({ fixAgeMs: FIX_STALE_MS + 1, tracking: false, venues: stale }), /not reached/);
});

test('sums up a block where everything has been silenced', () => {
  const venues = reportOnVenues(HERE, [jake, joe], {
    ...state,
    prompted: { jake: NOW - 60_000 },
    declined: { joe: NOW - 60_000 },
  });

  assert.match(summarise({ fixAgeMs: 60_000, tracking: true, venues }), /silenced/);
});

test('sums up standing somewhere with no venue in range', () => {
  const venues = reportOnVenues(HERE, [away], state);
  assert.match(summarise({ fixAgeMs: 60_000, tracking: true, venues }), /close enough/);
});
