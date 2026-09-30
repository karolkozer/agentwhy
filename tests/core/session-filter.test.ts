import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseSince, splitBySince } from '../../src/core/session-filter.ts';

const NOW = Date.parse('2026-09-14T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test('a span counts back from the moment given, never from the clock', () => {
  assert.deepEqual(parseSince('7d', NOW), { since: NOW - 7 * DAY, asked: '7d' });
  assert.deepEqual(parseSince('12h', NOW), { since: NOW - 12 * HOUR, asked: '12h' });
  assert.deepEqual(parseSince('2w', NOW), { since: NOW - 14 * DAY, asked: '2w' });
});

// A local midnight moves with the machine; a range on a page has to mean one moment to whoever reads it.
test('a calendar date is midnight UTC', () => {
  assert.deepEqual(parseSince('2026-09-01', NOW), { since: Date.parse('2026-09-01T00:00:00Z'), asked: '2026-09-01' });
});

test('what is not a span or a real date is refused with a sentence, not a guess', () => {
  for (const text of ['bogus', '7', 'd7', '0d', '2026-13-01', '']) {
    assert.ok('error' in parseSince(text, NOW), `${JSON.stringify(text)} is refused`);
  }
});

test('a session last written exactly at the start is inside the range', () => {
  const since = NOW - DAY;
  const sessions = [{ modifiedAt: since }, { modifiedAt: since - 1 }, { modifiedAt: NOW }];

  const { inRange, outOfRange } = splitBySince(sessions, since);

  assert.deepEqual(inRange, [{ modifiedAt: since }, { modifiedAt: NOW }]);
  assert.deepEqual(outOfRange, [{ modifiedAt: since - 1 }]);
});

// The earlier test tried month 13 - an edge the parser already refused. The edge that mattered is a day that
// overflows its month, which the parser quietly moves into the next one.
test('a day that does not exist in its month is refused, not moved', () => {
  for (const text of ['2026-02-29', '2026-02-30', '2026-04-31', '2026-06-31']) {
    assert.ok('error' in parseSince(text, NOW), `${text} is refused`);
  }
});

test('a leap day in a leap year is a real date', () => {
  assert.deepEqual(parseSince('2028-02-29', NOW), { since: Date.parse('2028-02-29T00:00:00Z'), asked: '2028-02-29' });
});

