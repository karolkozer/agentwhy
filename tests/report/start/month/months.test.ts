import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Redacted } from '../../../../src/core/redaction/redacted.ts';
import type { Tally } from '../../../../src/report/report-model.ts';
import type { IndexEntry, SessionIndex } from '../../../../src/report/start/session-index.ts';
import { conversationMonths } from '../../../../src/report/start/month/months.ts';

// Wednesday, 23 September 2026, 10:00 UTC.
const NOW = Date.parse('2026-09-23T10:00:00Z');
const ZERO: Tally = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, namedByCall: 0, refusedAttempts: 0, unknownAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };
const READ: Tally = { ...ZERO, contentsSeen: 1, filesReached: 1, namedByCall: 1 };

function entry(name: string, at: string, tally: Tally = ZERO): IndexEntry {
  return {
    provider: 'claude-code',
    name,
    modifiedAt: Date.parse(at),
    delegations: 0,
    report: { kind: 'generated', file: name + '.html', tally, incomplete: false, files: tally === READ ? [{ path: '.env' as Redacted, kind: 'seen' }] : [] },
  };
}

function index(entries: readonly IndexEntry[], extra: Partial<SessionIndex> = {}): SessionIndex {
  return { now: NOW, since: NOW - 120 * 86_400_000, asked: '120d', shared: false, widen: 'agentwhy start --since 240d', entries, ...extra };
}

// T2: a month is a calendar month, the 1st to its last day.
test('a month runs from the 1st to its last day, one tile per day', () => {
  const [september] = conversationMonths(index([entry('a', '2026-09-02T12:00:00Z')]));
  assert.deepEqual([september?.first.day, september?.first.month, september?.last.day, september?.days.length], [1, 9, 30, 30]);
  assert.equal(september?.first.weekday, 1, 'September 2026 opens on a Tuesday');
});

test('the last evening of a month is that month’s, the first morning of the next is the next one’s', () => {
  const months = conversationMonths(index([entry('aug', '2026-08-31T23:30:00Z'), entry('sep', '2026-09-01T00:10:00Z')]));
  assert.deepEqual(months.map((month) => [month.ago, month.conversations.map((item) => item.entry.name)]), [[0, ['sep']], [1, ['aug']]]);
});

// O2: days are the local ones of the machine that ran `start`.
test('months are read in the page’s time zone', () => {
  // 22:30 UTC on 31 August is 00:30 on 1 September in Warsaw (UTC+2).
  const months = conversationMonths(index([entry('late', '2026-08-31T22:30:00Z')], { timeZone: 'Europe/Warsaw' }));
  assert.deepEqual(months.map((month) => month.ago), [0], 'it is this month, not last month');
});

test('an empty month is not offered, but it is still counted when months are named; the current one always is', () => {
  const months = conversationMonths(index([entry('june', '2026-06-15T12:00:00Z')]));
  assert.deepEqual(months.map((month) => [month.ago, month.first.month, month.conversations.length]), [[0, 9, 0], [3, 6, 1]]);
});

test('a month in the year before is named by the calendar', () => {
  const months = conversationMonths(index([entry('winter', '2025-12-20T12:00:00Z')]));
  assert.deepEqual(months.map((month) => [month.ago, month.first.year, month.first.month, month.last.day]), [[0, 2026, 9, 30], [9, 2025, 12, 31]]);
});

test('days that have not come yet are marked, and each day counts its conversations and what to check', () => {
  const [september] = conversationMonths(index([entry('a', '2026-09-22T08:00:00Z', READ), entry('b', '2026-09-22T09:00:00Z')]));
  const days = september?.days ?? [];
  assert.deepEqual([days[21]?.conversations, days[21]?.toCheck, days[21]?.future], [2, 1, false]);
  assert.deepEqual([days[22]?.today, days[22]?.future, days[23]?.future], [true, false, true]);
});

// F9, for a month: the guide card names the newest conversation of the month that read something private.
test('the guide starts with the newest conversation of the month that read something private', () => {
  const [september] = conversationMonths(index([
    entry('older', '2026-09-03T08:00:00Z', READ), entry('clean', '2026-09-23T09:00:00Z'), entry('newer', '2026-09-15T08:00:00Z', READ),
  ]));
  assert.equal(september?.start?.entry.name, 'newer');
  assert.equal(september?.toFix, 2);
});

test('each day counts its conversations by look, for the summary a tile shows on hover', () => {
  const BLOCKED: Tally = { ...ZERO, refusedAttempts: 1 };
  const NAMED: Tally = { ...ZERO, filesReached: 1, onlyThroughResult: 1 };
  const [september] = conversationMonths(index([
    entry('a', '2026-09-22T08:00:00Z', READ), entry('b', '2026-09-22T09:00:00Z', NAMED), entry('c', '2026-09-22T10:00:00Z', NAMED),
    entry('d', '2026-09-22T11:00:00Z', BLOCKED), entry('e', '2026-09-22T12:00:00Z'),
  ]));
  assert.deepEqual(september?.days[21]?.looks, { read: 1, name: 2, stopped: 1, none: 1 });
  assert.deepEqual(september?.days[20]?.looks, {}, 'a day with no work counts nothing');
});
