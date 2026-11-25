// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Redacted } from '../../../src/core/redaction/redacted.ts';
import { computerAnswer, listAnswer } from '../../../src/report/answers/list-answer.ts';
import type { FileCount } from '../../../src/report/file-counts.ts';
import type { Tally } from '../../../src/report/report-model.ts';
import { conversationsOf } from '../../../src/report/start/conversations/periods.ts';
import type { IndexEntry, IndexFile, IndexReport, SessionIndex } from '../../../src/report/start/session-index.ts';

// `specs/2026-11-24-talking-about-agentwhy.md` CV1, CV5, CV7, CV15-CV17: what is answered about a project or this computer.

const NOW = Date.UTC(2026, 10, 24, 12);
const red = (text: string): Redacted => text as Redacted;
const TALLY = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, refusedAttempts: 0, unknownAttempts: 0 } as unknown as Tally;
const count = (path: string, more: Partial<FileCount> = {}): FileCount =>
  ({ path: red(path), tracked: false, read: 0, changed: 0, opened: 0, named: 0, unknown: 0, stopped: 0, stoppedBy: {}, helpers: 0, agents: 1, ...more });
let n = 0;
function entry(report: IndexReport, more: Partial<IndexEntry> = {}): IndexEntry {
  n += 1;
  return { name: `c${n}`, provider: 'claude-code', title: red(`Conversation ${n}`), lastActive: NOW - n * 60_000, delegations: 0, report, ...more } as IndexEntry;
}
const made = (tally: Partial<Tally> = {}, more: { files?: IndexFile[]; counts?: FileCount[]; incomplete?: boolean } = {}): IndexReport =>
  ({ kind: 'generated', file: 'r.html', tally: { ...TALLY, ...tally }, incomplete: false, ...more }) as IndexReport;
const READ = made({ contentsSeen: 1 }, { files: [{ path: red('.env'), kind: 'seen' }] });
const TRACKED = made({ contentsSeen: 1 }, { files: [{ path: red('notes/prices.md'), kind: 'told' }] });
const STOPPED = made({ refusedAttempts: 2 });
const NAMED = made({ filesReached: 1, onlyThroughResult: 1 });
const NONE = made();
const PARTLY = made({ unknownAttempts: 1, filesReached: 1 }, { incomplete: true });
const index = (entries: IndexEntry[], more: Partial<SessionIndex> = {}): SessionIndex =>
  ({ now: NOW, since: NOW - 7 * 86_400_000, asked: '7d', entries, ...more }) as SessionIndex;

test('each conversation is in one group, and the groups add up to what was read', () => {
  const answer = listAnswer(index([entry(READ), entry(TRACKED), entry(STOPPED), entry(NAMED), entry(NONE), entry(NONE), entry(PARTLY), entry({ kind: 'failed' }),
    entry({ kind: 'checking' }), entry({ kind: 'outside-range' })]), 'project');
  assert.deepEqual(answer.groups, { attention: 1, fixed: 0, tracked: 1, stopped: 1, seen: 1, none: 2, partly: 1, failed: 1 });
  assert.deepEqual(answer.checked, { read: 8, of: 9 });
  assert.equal(Object.values(answer.groups).reduce((sum, one) => sum + one, 0), answer.checked.read);
});

test('the groups are the page\'s own looks', () => {
  const made = index([entry(READ), entry(TRACKED), entry(STOPPED), entry(NONE), entry(PARTLY)]);
  const looks = conversationsOf(made).conversations.map((item) => item.look).sort();
  assert.deepEqual(listAnswer(made, 'project').rows.map((row) => row.look).sort(), looks);
});

test('over no conversation there is nothing to check, and no group holds one', () => {
  const answer = listAnswer(index([]), 'project');
  assert.deepEqual(answer.checked, { read: 0, of: 0 });
  assert.deepEqual(answer.rows, []);
});

test('a row is a title, a day, a look and counts: no file of it and no task', () => {
  const answer = listAnswer(index([entry(made({ contentsSeen: 1 }, { files: [{ path: red('CANARY/.env'), kind: 'seen' }], counts: [count('CANARY/.env', { read: 1 })] }))]), 'project');
  assert.ok(!JSON.stringify(answer.rows).includes('CANARY'));
  assert.equal(answer.rows[0]?.title, `Conversation ${n}`);
});

test('one file over conversations is one row: its four counts, its conversations, most wanted first', () => {
  const answer = listAnswer(index([
    entry(made({}, { counts: [count('.env', { read: 2, named: 1, helpers: 1 }), count('a.pem', { named: 4 })] })),
    entry(made({}, { counts: [count('.env', { stopped: 3, stoppedBy: { rule: 2, person: 1 } }), count('b.pem', { stopped: 1, stoppedBy: { rule: 1 } })] })),
    entry({ kind: 'checking' }),
  ]), 'project');
  assert.deepEqual(answer.often.map((row) => [row.path, row.wanted, row.read, row.stopped, row.named, row.unknown, row.conversations]), [['.env', 5, 2, 3, 1, 0, 2], ['b.pem', 1, 0, 1, 0, 0, 1]]);
  assert.equal(answer.namedOnly, 1);
});

test('a file outside the project is named by its name and where it lies, never by its path', () => {
  const answer = listAnswer(index([entry(made({}, { counts: [count('/Users/someone/elsewhere/keys.pem', { read: 1 })] }))]), 'project');
  assert.deepEqual([answer.often[0]?.path, answer.often[0]?.place], ['keys.pem', 'outside']);
  assert.ok(!JSON.stringify(answer).includes('/Users/someone'));
});

test('the same name in two projects of this computer is two rows', () => {
  const project = (id: string) => ({ project: { id, name: id } }) as unknown as Partial<IndexEntry>;
  const answer = listAnswer(index([entry(made({}, { counts: [count('.env', { read: 1 })] }), project('shop')), entry(made({}, { counts: [count('.env', { read: 1 })] }), project('blog'))],
    { computerView: { shown: 'projects' } }), 'computer');
  assert.deepEqual(answer.often.map((row) => row.project).sort(), ['blog', 'shop']);
});

test('what it covers is said: the range asked for, and which list of this computer', () => {
  assert.deepEqual([listAnswer(index([]), 'project').asked, listAnswer(index([]), 'project').list], ['7d', undefined]);
  assert.equal(listAnswer(index([], { computerView: { shown: 'outside' } }), 'computer').list, 'outside');
});

// Seen 2026-11-24 on a real project: one of 36 conversations read, and it said "already fixed" over a file nobody had marked -
// the check its look is read from had not caught up. While anything is still being read, fixed is not known.
test('nothing is called fixed while conversations are still being read', () => {
  // The page-first PR4a: a check says which conversations it counted, and one it did not is never fixed.
  const check = { rows: [], counted: ['one'] } as unknown as NonNullable<SessionIndex['check']>;
  const reading = listAnswer(index([entry(READ, { name: 'one' }), entry({ kind: 'checking' })], { check }), 'project');
  assert.deepEqual([reading.groups.fixed, reading.groups.attention, reading.rows[0]?.look], [0, 1, 'read']);
  const whole = listAnswer(index([entry(READ, { name: 'one' })], { check }), 'project');
  assert.deepEqual([whole.groups.fixed, whole.rows[0]?.look], [1, 'fixed']);
  const uncounted = listAnswer(index([entry(READ)], { check: { rows: [], counted: [] } as unknown as NonNullable<SessionIndex['check']> }), 'project');
  assert.deepEqual([uncounted.groups.fixed, uncounted.rows[0]?.look], [0, 'read']);
});

// Found 2026-11-24 drawing the terminal card: "which ones?" was answered from the twelve newest alone, so a project whose one
// conversation to act on was the thirteenth said none.
test('CV1: a group that is asked for by itself has its own newest rows, however far back they are', () => {
  const answer = listAnswer(index([...Array.from({ length: 20 }, () => entry(NONE)), ...Array.from({ length: 14 }, () => entry(READ)), entry(TRACKED), entry(STOPPED)]), 'project');
  assert.deepEqual([answer.recent, answer.rowsMore, answer.groups.attention], [20, 16, 14]);
  assert.ok(answer.rows.slice(0, answer.recent).every((row) => row.look === 'none'), 'the first are the newest');
  assert.deepEqual(['attention', 'tracked', 'stopped', 'none'].map((group) => answer.rows.filter((row) => row.group === group).length), [12, 1, 1, 20]);
  assert.equal(listAnswer(index([entry(NONE)]), 'project').recent, 1);
});

// The review of 2026-11-24.
test('CV15: this computer is both its lists, each with its own count, the one to act on first', () => {
  const project = (id: string) => ({ project: { id, name: id } }) as unknown as Partial<IndexEntry>;
  const outside = index([entry(NONE)], { computerView: { shown: 'outside' } });
  const projects = index([entry(READ, project('shop')), entry(NONE, project('shop'))], { computerView: { shown: 'projects' } });
  const answer = computerAnswer(outside, projects);
  assert.deepEqual([answer.list, answer.groups.attention, answer.checked.of, answer.beside?.list, answer.beside?.checked.of], ['projects', 1, 2, 'outside', 1]);
  assert.equal(computerAnswer(outside, undefined).beside, undefined);
  const empty = computerAnswer(index([], { computerView: { shown: 'outside' } }), projects);
  assert.deepEqual([empty.list, empty.beside?.checked.of], ['projects', 0]);
});

test('CV7: two conversations of one answer never share a short name', () => {
  const answer = listAnswer(index([
    entry(NONE, { name: 'codex-019ab3c4-1111-7000-8000-000000000001' }), entry(NONE, { name: 'codex-019ab3c4-2222-7000-8000-000000000002' }), entry(NONE, { name: '4f2a91c0-0000-4000-8000-000000000001' }),
  ]), 'project');
  const refs = answer.rows.map((row) => row.ref);
  assert.equal(new Set(refs).size, 3);
  assert.deepEqual(refs.map((ref) => ref.length), [13, 13, 8]);
  for (const row of answer.rows) assert.ok(row.key.replace(/^codex-/, '').startsWith(row.ref));
});

// The maintainer's run of 2026-11-24: "jakie mialem sesje" - when each was held, where, and how every day went.
test('a row says when the conversation was last active and where it was held, and nothing the record does not say', () => {
  const answer = listAnswer(index([entry(NONE, { entryPoint: 'terminal' }), entry(NONE, { provider: 'codex', entryPoint: 'unknown' }), entry(NONE)], { timeZone: 'UTC' }), 'project');
  assert.match(answer.rows[0]?.time ?? '', /^\d\d:\d\d$/);
  assert.deepEqual(answer.rows.map((row) => row.held), ['terminal', undefined, undefined]);
  assert.deepEqual(answer.rows.map((row) => row.provider), ['claude-code', 'codex', 'claude-code']);
});

// "mozna dodac ile plikow itp jeszcze", 2026-11-24.
test('a row counts its private and tracked files, each once by the strongest thing that happened to it, all its files, and its helpers', () => {
  const answer = listAnswer(index([entry({ ...made({ contentsSeen: 1 }, { counts: [
    count('.env', { read: 2, named: 4, stopped: 1 }), count('a.pem', { stopped: 3, named: 1 }), count('b.pem', { named: 2 }), count('c.pem', { opened: 1, named: 1 }), count('d.pem', { unknown: 1, stopped: 1 }), count('e.pem', { changed: 1, named: 1 }),
  ] }), reached: 41 } as IndexReport, { delegations: 3 }), entry(NONE), entry({ kind: 'failed' })]), 'project');
  assert.deepEqual(answer.rows[0]?.files, { read: 1, changed: 1, unknown: 1, opened: 1, stopped: 1, name: 1 });
  assert.deepEqual(answer.rows.map((row) => [row.all, row.helpers]), [[41, 3], [undefined, 0], [undefined, 0]]);
  assert.deepEqual(answer.rows[1]?.files, { read: 0, changed: 0, unknown: 0, opened: 0, stopped: 0, name: 0 });
});

test('the newest twenty are named, and the newest twelve of each group asked for by itself', () => {
  const answer = listAnswer(index(Array.from({ length: 60 }, (_, at) => entry(at >= 30 ? STOPPED : NONE))), 'project');
  assert.deepEqual([answer.recent, answer.rowsMore, answer.rows.length], [20, 40, 32]);
});

test('an answer taken while the page still reads says so; one over a whole list does not', () => {
  assert.equal(listAnswer(index([entry(NONE)], { reading: { read: 1, of: 2, why: 'updating' } } as Partial<SessionIndex>), 'project').reading, true);
  assert.equal(listAnswer(index([entry(NONE)]), 'project').reading, undefined);
});

// The call that asks has no result yet. Left in, every question about a project would say that one conversation is not fully checked.
test('the call that asks is no gap of its conversation; another open call is, and so is any other gap', () => {
  const open = (gaps: object, calls: readonly string[]) => ({ ...made({}, { incomplete: true }), gaps, openCalls: calls }) as IndexReport;
  const groupOf = (report: IndexReport, asking?: string) => listAnswer(index([entry(report)]), 'project', asking).rows[0]?.group;
  assert.equal(groupOf(open({ noResult: 1 }, ['toolu_asking'])), 'partly');
  assert.equal(groupOf(open({ noResult: 1 }, ['toolu_asking']), 'toolu_asking'), 'none');
  assert.equal(groupOf(open({ noResult: 1 }, ['toolu_other']), 'toolu_asking'), 'partly');
  assert.equal(groupOf(open({ noResult: 2 }, ['toolu_asking', 'toolu_other']), 'toolu_asking'), 'partly');
  assert.equal(groupOf(open({ noResult: 1, unread: 1 }, ['toolu_asking']), 'toolu_asking'), 'partly');
});

test('a list still being read says how many of its newest are read, up to the first that is not', () => {
  const checking = { kind: 'checking' } as IndexReport;
  assert.equal(listAnswer(index([entry(NONE), entry(READ), entry(checking), entry(NONE)]), 'project').newestRead, 2);
  assert.equal(listAnswer(index([entry(checking), entry(NONE), entry(NONE)]), 'project').newestRead, 0);
  assert.equal(listAnswer(index([entry(NONE)]), 'project').newestRead, undefined);
});
