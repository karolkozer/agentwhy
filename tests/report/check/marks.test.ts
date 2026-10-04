// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import type { MarkRecord } from '../../../src/ports/mark-store.ts';
import { actionsAfterMarks, markLines, marksInRange, resultAllowed, standingMarks } from '../../../src/report/check/marks.ts';
import type { SessionActions } from '../../../src/report/check/session-actions.ts';

const redactor = new Redactor('test');
const DAY = 86_400_000;
const T = Date.parse('2026-09-16T10:00:00Z');

const mark = (path: string, at: number, result: 'rotated' | 'not-secret' = 'rotated'): MarkRecord =>
  ({ kind: 'mark', path, label: 'rotate', result, at, sessions: ['s-1'] });
const unmark = (path: string, at: number): MarkRecord => ({ kind: 'unmark', path, at });

const actions = (rotate: string[], routes: string[] = []): SessionActions => ({
  policy: redactor.term('BUILT-IN DEFAULT'),
  rotate: rotate.map((path) => ({ path: redactor.path(path), template: false })),
  openRoutes: routes.map((path) => ({ path: redactor.path(path), did: redactor.term('Read'), occurrences: 1 })),
  onlyInResults: [],
  unknown: [],
  refusedAttempts: 1,
  secretShapes: [],
  mentions: 0,
});

// R34: the record is appended to, so what stands is read from the whole of it, in order.
test('the last mark of a path stands, unless an unmark came after it', () => {
  const standing = standingMarks([mark('.env', T), mark('a.key', T), unmark('a.key', T + 1), mark('.env', T + 2, 'not-secret')]);

  assert.deepEqual([...standing.keys()], ['.env']);
  assert.equal(standing.get('.env')?.result, 'not-secret');
});

test('the history keeps every mark, newest first, with what became of it', () => {
  const lines = markLines([mark('.env', T), mark('a.key', T + 1), unmark('a.key', T + 5), mark('.env', T + 9)]);

  assert.deepEqual(lines.map((line) => [line.mark.path, line.mark.at, line.status, line.endedAt]), [
    ['.env', T + 9, 'standing', undefined],
    ['a.key', T + 1, 'undone', T + 5],
    ['.env', T, 'replaced', T + 9],
  ]);
});

// R35: a mark covers the sessions it was made after, and not one active later.
test('a marked file leaves a session last active before the mark, and stays in one active after it', () => {
  const standing = standingMarks([mark('.env', T)]);

  const before = actionsAfterMarks(actions(['.env', 'b.key'], ['.env']), T - DAY, standing);
  const after = actionsAfterMarks(actions(['.env']), T + DAY, standing);

  assert.deepEqual(before.rotate.map((file) => file.path), ['b.key']);
  assert.deepEqual(before.openRoutes, []);
  assert.equal(before.refusedAttempts, 1, 'what names no file is kept');
  assert.deepEqual(after.rotate.map((file) => file.path), ['.env']);
});

test('a range counts the marks that took a file out, and names the ones a later session brought back', () => {
  const standing = standingMarks([mark('.env', T), mark('b.key', T), mark('elsewhere.key', T)]);
  const sessions = [
    { actions: actions(['.env', 'b.key']), lastActive: T - DAY },
    { actions: actions(['b.key']), lastActive: T + DAY },
  ];

  const { done, reopened } = marksInRange(
    sessions.map((session) => session.actions),
    sessions.map((session) => actionsAfterMarks(session.actions, session.lastActive, standing)),
    standing,
  );

  assert.equal(done, 1, '.env only; a mark whose file this range never reached is not counted');
  assert.deepEqual(reopened.map((entry) => entry.path), ['b.key']);
});

// R31: a key that was in an agent's context is not cleared by calling it fake.
test('only a template line may be marked as not a real secret', () => {
  assert.equal(resultAllowed({ label: 'template' }, 'not-secret'), true);
  assert.equal(resultAllowed({ label: 'rotate' }, 'not-secret'), false);
  assert.equal(resultAllowed({ label: 'rotate' }, 'rotated'), true);
  assert.equal(resultAllowed({ label: 'unknown' }, 'rotated'), true);
  // F25, F50: a file with no key in it may be closed as handled or not private; one a key was read from may not.
  assert.equal(resultAllowed({ label: 'rotate' }, 'handled'), true);
  assert.equal(resultAllowed({ label: 'rotate' }, 'not-private'), true);
  assert.equal(resultAllowed({ label: 'rotate', keyed: true }, 'handled'), false);
  assert.equal(resultAllowed({ label: 'template', keyed: true }, 'not-private'), false);
  assert.equal(resultAllowed({ label: 'rotate', keyed: true }, 'rotated'), true);
});
