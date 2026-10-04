// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Redacted } from '../../../../src/core/redaction/redacted.ts';
import type { Tally } from '../../../../src/report/report-model.ts';
import type { IndexEntry, SessionIndex } from '../../../../src/report/start/session-index.ts';
import { conversationWeeks } from '../../../../src/report/start/conversations/weeks.ts';

// Wednesday, 23 September 2026, 10:00 UTC.
const NOW = Date.parse('2026-09-23T10:00:00Z');
const ZERO: Tally = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, namedByCall: 0, refusedAttempts: 0, unknownAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };
const READ: Tally = { ...ZERO, contentsSeen: 1, filesReached: 1, namedByCall: 1 };

function entry(name: string, at: string, tally: Tally = ZERO, extra: Partial<IndexEntry> = {}): IndexEntry {
  return {
    provider: 'claude-code',
    name,
    modifiedAt: Date.parse(at),
    delegations: 0,
    report: { kind: 'generated', file: name + '.html', tally, incomplete: false, files: tally === READ ? [{ path: '.env' as Redacted, kind: 'seen' }] : [] },
    ...extra,
  };
}

function index(entries: readonly IndexEntry[], extra: Partial<SessionIndex> = {}): SessionIndex {
  return { now: NOW, since: NOW - 30 * 86_400_000, asked: '30d', shared: false, widen: 'agentwhy start --since 60d', entries, ...extra };
}

// O3: a week is a calendar week, Monday to Sunday.
test('a week runs Monday to Sunday: Sunday night is last week, Monday morning is this week', () => {
  const { weeks } = conversationWeeks(index([entry('sun', '2026-09-20T23:30:00Z'), entry('mon', '2026-09-21T00:10:00Z')]));

  assert.deepEqual(weeks.map((week) => [week.ago, week.conversations.map((item) => item.entry.name)]), [[0, ['mon']], [1, ['sun']]]);
  const [thisWeek] = weeks;
  assert.deepEqual([thisWeek?.first.day, thisWeek?.first.weekday, thisWeek?.last.day, thisWeek?.last.weekday], [21, 0, 27, 6]);
  assert.equal(thisWeek?.days.length, 7);
});

// O2: days and times are the local ones of the machine that ran `start`, not UTC.
test('days and times are read in the page’s time zone', () => {
  // 22:30 UTC on Sunday is 00:30 on Monday in Warsaw, in September (UTC+2).
  const { weeks } = conversationWeeks(index([entry('late', '2026-09-20T22:30:00Z')], { timeZone: 'Europe/Warsaw' }));

  assert.equal(weeks.length, 1, 'it is this week, not last week');
  const item = weeks[0]?.conversations[0];
  assert.deepEqual([item?.day.day, item?.day.weekday, item?.time], [21, 0, '00:30']);
});

test('an unknown time zone is read as UTC rather than failing the run', () => {
  const { weeks } = conversationWeeks(index([entry('x', '2026-09-23T08:59:00Z')], { timeZone: 'Not/A_Zone' }));
  assert.equal(weeks[0]?.conversations[0]?.time, '08:59');
});

test('today and yesterday are named as such; any other day by its date', () => {
  const { weeks } = conversationWeeks(index([
    entry('today', '2026-09-23T08:00:00Z'), entry('yesterday', '2026-09-22T08:00:00Z'), entry('monday', '2026-09-21T08:00:00Z'),
  ]));
  assert.deepEqual(weeks[0]?.conversations.map((item) => item.relative), ['today', 'yesterday', undefined]);
});

test('an empty week is not offered, but it is still counted when weeks are named', () => {
  const { weeks } = conversationWeeks(index([entry('old', '2026-09-02T12:00:00Z')]));
  assert.deepEqual(weeks.map((week) => week.ago), [0, 3], 'this week always, then three weeks ago; the two between are dead ends');
});

test('days that have not come yet are marked, and each day counts its conversations and what to check', () => {
  const { weeks } = conversationWeeks(index([entry('a', '2026-09-22T08:00:00Z', READ), entry('b', '2026-09-22T09:00:00Z')]));
  const days = weeks[0]?.days ?? [];
  assert.deepEqual(days.map((day) => [day.conversations, day.toCheck, day.future]), [
    [0, 0, false], [2, 1, false], [0, 0, false], [0, 0, true], [0, 0, true], [0, 0, true], [0, 0, true],
  ]);
});

// F9: the guide card names the newest conversation whose AI read something private.
test('the guide starts with the newest conversation that read something private', () => {
  const { weeks } = conversationWeeks(index([
    entry('older-read', '2026-09-21T08:00:00Z', READ), entry('newest-clean', '2026-09-23T09:00:00Z'), entry('newer-read', '2026-09-22T08:00:00Z', READ),
  ]));
  assert.equal(weeks[0]?.start?.entry.name, 'newer-read');
  assert.equal(weeks[0]?.toFix, 2);
  assert.equal(weeks[0]?.start?.read, 1, 'it counts the files whose contents were read');
});

test('a week with nothing read has no start', () => {
  const { weeks } = conversationWeeks(index([entry('clean', '2026-09-23T09:00:00Z')]));
  assert.equal(weeks[0]?.start, undefined);
  assert.equal(weeks[0]?.toFix, 0);
});

// F16, P2: the report headline's ladder, with the states the design does not draw kept apart.
test('each conversation takes its look from the report headline’s ladder', () => {
  const { weeks } = conversationWeeks(index([
    entry('read', '2026-09-23T09:06:00Z', READ),
    entry('name', '2026-09-23T09:05:00Z', { ...ZERO, filesReached: 1, onlyThroughResult: 1 }),
    entry('stopped', '2026-09-23T09:04:00Z', { ...ZERO, refusedAttempts: 1 }),
    entry('gap', '2026-09-23T09:03:00Z', ZERO, { report: { kind: 'generated', file: 'gap.html', tally: ZERO, incomplete: true } }),
    entry('failed', '2026-09-23T09:02:00Z', ZERO, { report: { kind: 'failed' } }),
    entry('outside', '2026-09-23T09:01:00Z', ZERO, { report: { kind: 'outside-range' } }),
    entry('none', '2026-09-23T09:00:00Z'),
  ]));
  assert.deepEqual(weeks[0]?.conversations.map((item) => [item.entry.name, item.look]), [
    ['read', 'read'], ['name', 'name'], ['stopped', 'stopped'], ['gap', 'unchecked'], ['failed', 'failed'], ['outside', 'outside'], ['none', 'none'],
  ]);
});

// O10: the sidebar counts everything still to fix, from any week - the lines that ask for something to be done.
test('the count of what is left to fix is every line that asks for something, from any week', () => {
  const rows = (['rotate', 'template', 'unknown', 'route', 'result'] as const).map((label) => ({ label, path: label as Redacted, sessions: [] }));
  const model = conversationWeeks(index([], { check: { rows, refusedAttempts: 0 } }));
  assert.equal(model.toFix, 3);
  assert.equal(model.total, 0);
  assert.deepEqual(model.weeks.map((week) => week.ago), [0], 'a page with nothing on it still has this week');
});

test('today is marked among the days of the current week, and on no other week', () => {
  const { weeks } = conversationWeeks(index([entry('now', '2026-09-23T08:00:00Z'), entry('old', '2026-09-09T08:00:00Z')]));
  assert.deepEqual(weeks[0]?.days.map((day) => day.today), [false, false, true, false, false, false, false]);
  assert.ok(weeks[1]?.days.every((day) => !day.today));
});
