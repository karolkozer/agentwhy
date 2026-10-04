// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Redacted } from '../../../../src/core/redaction/redacted.ts';
import type { CheckRow, HistoryLine, IndexCheck } from '../../../../src/report/check/check-lines.ts';
import type { Tally } from '../../../../src/report/report-model.ts';
import type { IndexEntry, SessionIndex } from '../../../../src/report/start/session-index.ts';
import { toFixView } from '../../../../src/report/start/to-fix/to-fix-view.ts';

// `.ai/plans/2026-09-23-to-fix-redesign.md`, step 1: what the To fix page shows, from the index alone.

// Wednesday, 23 September 2026, 10:00 UTC.
const NOW = Date.parse('2026-09-23T10:00:00Z');
const ZERO: Tally = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, namedByCall: 0, refusedAttempts: 0, unknownAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };
const BUILT_IN = ['**/.env*', '**/*.env', '**/.npmrc', '**/secrets/**', '**/.ssh/**', '**/id_rsa*'];

function entry(name: string, at: string, report = true): IndexEntry {
  return {
    provider: 'claude-code',
    name,
    title: ('Asked in ' + name) as Redacted,
    modifiedAt: Date.parse(at),
    delegations: 0,
    report: report ? { kind: 'generated', file: name + '.html', tally: ZERO, incomplete: false, files: [] } : { kind: 'failed' },
  };
}

function row(label: CheckRow['label'], path: string, sessions: readonly string[], extra: Partial<CheckRow> = {}): CheckRow {
  return { label, path: path as Redacted, sessions, ...extra };
}

function index(check: IndexCheck, extra: Partial<SessionIndex> = {}): SessionIndex {
  return {
    now: NOW, timeZone: 'UTC', since: NOW - 30 * 86_400_000, asked: '30d', shared: false, widen: 'agentwhy start --since 60d',
    entries: [entry('a', '2026-09-23T09:59:00Z'), entry('b', '2026-09-22T15:37:00Z'), entry('c', '2026-09-18T11:00:00Z', false)],
    settings: { level: 'no-read', protected: BUILT_IN, allowed: [], origin: { kind: 'default' } },
    check,
    ...extra,
  };
}

test('T4, T7: keys to change, a look to take, and the names only seen, each in its own group', () => {
  const view = toFixView(index({
    rows: [
      row('rotate', '.env', ['a']),
      row('template', '.env.example', ['a']),
      row('unknown', 'config/secrets/app.yml', ['b']),
      row('route', '.env.local', ['a']),
      row('result', '.env.b9', ['b']),
    ],
    refusedAttempts: 1,
  }));
  assert.deepEqual(view.keys.map((file) => file.path), ['.env']);
  assert.deepEqual(view.look.map((file) => file.path), ['.env.example', 'config/secrets/app.yml'], 'D1: an unknown outcome is looked at');
  assert.deepEqual(view.seen.map((file) => file.path), ['.env.b9', '.env.local'].sort());
  assert.equal(view.total, 3, 'the same count the sidebar gives (TO_DO_LABELS)');
  assert.equal(view.state, 'keys');
  assert.equal(view.refusedAttempts, 1);
});

test('T8: in a group, the most conversations first, then by path', () => {
  const view = toFixView(index({
    rows: [
      row('rotate', 'b/.env', ['a']),
      row('rotate', 'a/.env', ['a']),
      row('rotate', 'many/.env', ['a', 'b', 'c']),
      row('rotate', 'back/.env', ['a'], { reopened: { result: 'rotated', at: Date.parse('2026-09-19T12:00:00Z') } }),
    ],
    refusedAttempts: 0,
  }));
  assert.deepEqual(view.keys.map((file) => file.path), ['many/.env', 'a/.env', 'b/.env', 'back/.env']);
  const back = view.keys.find((file) => file.path === 'back/.env');
  assert.equal(back?.reopened?.day.number, Date.UTC(2026, 8, 19) / 86_400_000, 'marked on Saturday 19 September');
  assert.equal(back?.reopened?.time, '12:00');
});

test('T6, D2: a file is named by the rule in force that matched it, and by nothing else', () => {
  const view = toFixView(index({ rows: [row('rotate', 'app/.env.production', ['a']), row('rotate', 'customers.csv', ['a']), row('rotate', 'deploy/id_rsa', ['a'])], refusedAttempts: 0 }));
  const names = Object.fromEntries(view.keys.map((file) => [file.path, file.name]));
  assert.equal(names['app/.env.production'], 'env');
  assert.equal(names['deploy/id_rsa'], 'ssh');
  assert.equal(names['customers.csv'], undefined, 'no rule, no name: "A private file"');

  const onlyNpmrc = toFixView(index({ rows: [row('rotate', '.env', ['a'])], refusedAttempts: 0 }, {
    settings: { level: 'no-read', protected: ['**/.npmrc'], allowed: [], origin: { kind: 'default' } },
  }));
  assert.equal(onlyNpmrc.keys[0]?.name, undefined, 'a rule not in force names nothing');
});

test('T14: each kind offers the marks that close it, and a file a key was read from only rotated', () => {
  const view = toFixView(index({
    rows: [
      row('rotate', '.env', ['a']),
      row('template', '.env.example', ['a']),
      row('template', 'keyed.env.example', ['a'], { keyed: true }),
      row('unknown', 'secrets/x', ['a']),
      row('unknown', 'secrets/keyed', ['a'], { keyed: true }),
    ],
    refusedAttempts: 0,
  }));
  const results = Object.fromEntries([...view.keys, ...view.look].map((file) => [file.path, file.results]));
  assert.deepEqual(results['.env'], ['rotated']);
  assert.deepEqual(results['.env.example'], ['not-secret', 'rotated']);
  assert.deepEqual(results['keyed.env.example'], ['rotated'], 'a key was read from it, so "No real keys" is not offered (review, 2026-09-24)');
  assert.deepEqual(results['secrets/x'], ['handled']);
  assert.deepEqual(results['secrets/keyed'], [], 'a keyed unknown cannot be closed as handled');
});

test('T15: the conversations behind a file, newest first, on the page\'s clock, with their reports', () => {
  const view = toFixView(index({ rows: [row('rotate', '.env', ['c', 'a', 'b', 'gone'])], refusedAttempts: 0 }));
  const file = view.keys[0];
  assert.equal(file?.count, 4, 'every conversation counted, including one this run no longer lists');
  assert.deepEqual(file?.conversations.map((each) => [each.entry.name, each.when.relative, each.when.time, each.report]), [
    ['a', 'today', '09:59', 'a.html'],
    ['b', 'yesterday', '15:37', 'b.html'],
    ['c', undefined, '11:00', undefined],
  ]);

  const warsaw = toFixView(index({ rows: [row('rotate', '.env', ['a'])], refusedAttempts: 0 }, { timeZone: 'Europe/Warsaw' }));
  assert.equal(warsaw.keys[0]?.conversations[0]?.when.time, '11:59', 'local time (O2)');
});

test('T9: Done is every standing mark not reopened, newest first, with its note', () => {
  const line = (path: string, at: string, extra: Partial<HistoryLine> = {}): HistoryLine =>
    ({ path, label: 'rotate', result: 'rotated', at: Date.parse(at), sessions: [], status: 'standing', reopened: false, ...extra });
  const view = toFixView(index({
    rows: [],
    refusedAttempts: 0,
    history: [
      line('.env.test', '2026-09-17T10:00:00Z'),
      line('.env.production', '2026-09-18T10:00:00Z', { note: 'New keys in Stripe and Supabase' }),
      line('.env.old', '2026-09-16T10:00:00Z', { status: 'undone' }),
      line('.env', '2026-09-19T10:00:00Z', { reopened: true }),
    ],
  }));
  assert.deepEqual(view.done.map((file) => [file.path, file.note, file.name]), [
    ['.env.production', 'New keys in Stripe and Supabase', 'env'],
    ['.env.test', undefined, 'env'],
  ]);
  assert.equal(view.state, 'none');
  assert.equal(view.total, 0);
});

test('T2: the hero\'s second line follows what is left', () => {
  assert.equal(toFixView(index({ rows: [row('template', '.env.example', ['a'])], refusedAttempts: 0 })).state, 'look');
  assert.equal(toFixView(index({ rows: [row('result', '.env', ['a'])], refusedAttempts: 0 })).state, 'none', 'a name only seen is nothing to fix');
});

test('an index with no check, or with marks it could not read, is said so and invents nothing', () => {
  const { check: _check, ...rest } = index({ rows: [], refusedAttempts: 0 });
  const empty = toFixView(rest);
  assert.deepEqual([empty.keys, empty.look, empty.seen, empty.done], [[], [], [], []]);
  assert.equal(empty.marksUnreadable, false);
  assert.equal(toFixView(index({ rows: [], refusedAttempts: 0, marksUnreadable: true })).marksUnreadable, true);
});
