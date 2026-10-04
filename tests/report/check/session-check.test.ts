// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import type { SessionListing } from '../../../src/core/session-catalogue.ts';
import { FileAccessError } from '../../../src/ports/file-access-error.ts';
import type { MarkRecord } from '../../../src/ports/mark-store.ts';
import type { ActionsDigest } from '../../../src/report/check/actions-digest.ts';
import type { SessionActions } from '../../../src/report/check/session-actions.ts';
import { SessionCheck } from '../../../src/report/check/session-check.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-17T12:00:00Z');
const redactor = new Redactor('test');
const WEEK = { since: { since: NOW - 7 * DAY, asked: '7d' } };

const LISTING: SessionListing = {
  directory: '/stored/project',
  found: true,
  searched: [{ provider: 'claude-code', directory: '/stored/project', found: true }],
  sessions: [
    { id: 'sess-old', path: '/stored/sess-old.jsonl', modifiedAt: NOW - 3 * DAY, delegations: 0, provider: 'claude-code' },
    { id: 'sess-new', path: '/stored/sess-new.jsonl', modifiedAt: NOW - DAY / 2, delegations: 0, provider: 'claude-code' },
  ],
};

const actions = (rotate: readonly { path: string; template?: boolean; keyed?: true }[]): SessionActions => ({
  policy: redactor.term('BUILT-IN DEFAULT'),
  rotate: rotate.map((file) => ({ path: redactor.path(file.path), template: file.template === true, ...(file.keyed ? { keyed: file.keyed } : {}) })),
  openRoutes: [],
  onlyInResults: [],
  unknown: [],
  refusedAttempts: 0,
  secretShapes: [],
  mentions: 0,
});

function checkIn(world: { readonly actionsFor: (input: string) => SessionActions; readonly marks?: MarkRecord[]; readonly failing?: boolean }) {
  const digests: ActionsDigest[] = [];
  const appended: MarkRecord[] = [];
  const records = world.marks ?? [];
  const check = new SessionCheck({
    catalogue: { list: async () => LISTING },
    report: {
      run: async (options) => ({
        outcome: 'complete',
        output: '',
        tally: { contentsSeen: 0, filesReached: 1, onlyThroughResult: 0, namedByCall: 1, refusedAttempts: 0, unknownAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 },
        actions: world.actionsFor(options.input ?? ''),
      }),
    },
    files: {
      readText: async (path) => {
        throw new FileAccessError('not-found', path);
      },
      readLines: () => {
        throw new Error('not read');
      },
    },
    createRenderer: () => ({
      render: (digest) => {
        digests.push(digest);
        return 'DIGEST\n';
      },
    }),
    marks: {
      read: async () => ({ records: [...records, ...appended], skipped: 0, failed: world.failing === true }),
      append: async (record) => {
        if (world.failing === true) return false;
        appended.push(record);
        return true;
      },
    },
    workingDirectory: '/work/project',
    now: NOW,
  });
  return { check, digests, appended };
}

const bothReach = (input: string): SessionActions => actions(input.includes('old') ? [{ path: '.env' }, { path: 'b.key' }] : [{ path: 'b.key' }]);

// R31: what is recorded is the line as the check has it - its label and its sessions - with the note and the moment.
test('a mark records the line, its sessions, the note and the moment, and says how to undo it', async () => {
  const { check, appended } = checkIn({ actionsFor: bothReach });

  const result = await check.mark({ ...WEEK, path: 'b.key', result: 'rotated', note: '  new keys in the console  ' });

  assert.equal(result.outcome, 'marked');
  assert.deepEqual(appended, [
    { kind: 'mark', path: 'b.key', label: 'rotate', result: 'rotated', at: NOW, note: 'new keys in the console', sessions: ['sess-old', 'sess-new'] },
  ]);
  assert.match(result.output, /^Marked b\.key as rotated on 2026-09-17 12:00 UTC\./);
  assert.match(result.output, /Undo: agentwhy check --unmark 'b\.key'/);
});

test('a mark names a line of the check, or nothing is recorded and the lines are listed', async () => {
  const { check, appended } = checkIn({ actionsFor: bothReach });

  const result = await check.mark({ ...WEEK, path: 'nope.env', result: 'rotated' });

  assert.equal(result.outcome, 'mark-refused');
  assert.deepEqual(appended, []);
  assert.match(result.output, /^nope\.env is not a line of the check for sessions active since 7d\. Nothing was recorded\./);
  assert.match(result.output, /^ {2}ROTATE {2}b\.key$/m);
});

test('a rotate line cannot be called not a real secret, and a template line can', async () => {
  const { check, appended } = checkIn({ actionsFor: () => actions([{ path: '.env' }, { path: '.env.example', template: true }]) });

  assert.equal((await check.mark({ ...WEEK, path: '.env', result: 'not-secret' })).outcome, 'mark-refused');
  assert.equal((await check.mark({ ...WEEK, path: '.env.example', result: 'not-secret' })).outcome, 'marked');
  assert.deepEqual(appended.map((record) => record.path), ['.env.example']);
});

// F25, F50: a file nothing recognisable was read from can be closed as handled or as not private; a file a key was
// read from is closed by changing the key, and the refusal says so.
test('handled and not private close a file with no key in it, and never one a key was read from', async () => {
  const { check, appended } = checkIn({ actionsFor: () => actions([{ path: 'data/customers.csv' }, { path: '.env', keyed: true }]) });

  assert.equal((await check.mark({ ...WEEK, path: 'data/customers.csv', result: 'handled' })).outcome, 'marked');
  assert.equal((await check.mark({ ...WEEK, path: 'data/customers.csv', result: 'not-private' })).outcome, 'marked');
  const refused = await check.mark({ ...WEEK, path: '.env', result: 'not-private' });
  assert.equal(refused.outcome, 'mark-refused');
  assert.match(refused.output, /^A key was read from \.env, so it is marked rotated once the key is changed, not "not private"\. Nothing was recorded\./);
  assert.equal((await check.mark({ ...WEEK, path: '.env', result: 'handled' })).outcome, 'mark-refused');
  assert.deepEqual(appended.map((record) => [record.path, record.kind === 'mark' ? record.result : 'unmark']), [['data/customers.csv', 'handled'], ['data/customers.csv', 'not-private']]);
});

test('a note is one short line, or nothing is recorded', async () => {
  const { check, appended } = checkIn({ actionsFor: bothReach });

  assert.equal((await check.mark({ ...WEEK, path: 'b.key', result: 'rotated', note: 'two\nlines' })).outcome, 'mark-refused');
  assert.equal((await check.mark({ ...WEEK, path: 'b.key', result: 'rotated', note: 'x'.repeat(201) })).outcome, 'mark-refused');
  assert.deepEqual(appended, []);
});

// R35: the file leaves the sessions from before the mark; one active after it brings it back, counted in those alone.
test('after a mark, a file only earlier sessions reached is done, and one a later session reached is back', async () => {
  const marked = NOW - DAY;
  const { check, digests } = checkIn({
    actionsFor: bothReach,
    marks: [
      { kind: 'mark', path: '.env', label: 'rotate', result: 'rotated', at: marked, sessions: ['sess-old'] },
      { kind: 'mark', path: 'b.key', label: 'rotate', result: 'rotated', at: marked, sessions: ['sess-old'] },
    ],
  });

  await check.run({ ...WEEK, share: false, full: false });

  const digest = digests[0];
  assert.deepEqual(digest?.rotate, [{ path: 'b.key', sessions: 1 }], 'only the session after the mark counts');
  assert.deepEqual(digest?.marks, { done: 1, reopened: [{ path: 'b.key', result: 'rotated', at: marked }], unreadable: false });
});

// R34: undoing adds a line; the mark stays in the record.
test('an unmark is appended for a standing mark, and refused for a path with none', async () => {
  const { check, appended } = checkIn({
    actionsFor: bothReach,
    marks: [{ kind: 'mark', path: '.env', label: 'rotate', result: 'rotated', at: NOW - DAY, sessions: [] }],
  });

  assert.equal((await check.unmark({ path: 'b.key' })).outcome, 'mark-refused');
  const result = await check.unmark({ path: '.env' });

  assert.equal(result.outcome, 'marked');
  assert.deepEqual(appended, [{ kind: 'unmark', path: '.env', at: NOW }]);
  assert.match(result.output, /^\.env is back in To do\./);
});

// Invariant 4: a record that could not be read hides nothing, and says so.
test('a record of marks that cannot be read hides nothing, and a mark that cannot be written says so', async () => {
  const { check, digests } = checkIn({ actionsFor: bothReach, failing: true });

  await check.run({ ...WEEK, share: false, full: false });
  const result = await check.mark({ ...WEEK, path: 'b.key', result: 'rotated' });

  assert.equal(digests[0]?.rotate.length, 2);
  assert.equal(digests[0]?.marks?.unreadable, true);
  assert.equal(result.outcome, 'mark-failed');
});
