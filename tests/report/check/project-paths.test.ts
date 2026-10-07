// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import { checkOf, checkWithMarks } from '../../../src/report/check/check-lines.ts';
import { markLines, standingMarks } from '../../../src/report/check/marks.ts';
import { checkByProject, inProject, marksOfProject, outOfProject, projectActions, projectRecords } from '../../../src/report/check/project-paths.ts';
import type { SessionActions } from '../../../src/report/check/session-actions.ts';
import type { MarkRecord } from '../../../src/ports/mark-store.ts';

// `.ai/specs/2026-10-05-protected-everywhere.md` GD18: the same file in two projects is two files, each with its own mark.

const APP = '/Users/someone/Projects/app';
const BLOG = '/Users/someone/Projects/blog';
const redactor = new Redactor('test');

function actions(path: string): SessionActions {
  return {
    policy: redactor.term('BUILT-IN DEFAULT'),
    rotate: [{ path: redactor.path(path), template: false }],
    openRoutes: [],
    onlyInResults: [],
    unknown: [],
    refusedAttempts: 0,
    secretShapes: [],
    mentions: 0,
  };
}

const named = (folder: string) => ({ id: folder.replaceAll('/', '-'), name: folder.split('/').at(-1) ?? '' });

test('a key holds the project and the path, and a path that is no key is a path of no project', () => {
  assert.deepEqual(outOfProject(inProject(APP, '.env')), { folder: APP, path: '.env' });
  assert.deepEqual(outOfProject('.env'), { path: '.env' });
});

test('one .env in two projects is two rows, each back at its own path and naming its project', () => {
  const check = checkOf([
    { name: 'app-1', actions: projectActions(APP, actions('.env')) },
    { name: 'blog-1', actions: projectActions(BLOG, actions('.env')) },
    { name: 'app-2', actions: projectActions(APP, actions('.env')) },
  ]);
  assert.equal(check.rows.length, 2);
  const drawn = checkByProject(check, named);
  assert.deepEqual(drawn.rows.map((row) => [row.path, row.project?.name, row.sessions]), [
    ['.env', 'app', ['app-1', 'app-2']],
    ['.env', 'blog', ['blog-1']],
  ]);
  // Unkeyed, the same three are one row, as a project's own page draws them.
  assert.equal(checkOf([{ name: 'a', actions: actions('.env') }, { name: 'b', actions: actions('.env') }]).rows.length, 1);
});

test('a mark in one project’s record covers that project’s file, and its history line names the project', () => {
  const mark: MarkRecord = { kind: 'mark', path: '.env', label: 'ROTATE', result: 'rotated', at: 10, sessions: ['app-1'] };
  const records = [...projectRecords(APP, [mark]), ...projectRecords(BLOG, [])];
  const standing = standingMarks(records);
  assert.deepEqual([...marksOfProject(APP, standing).keys()], ['.env'], 'the report of an app conversation is drawn with it');
  assert.equal(marksOfProject(BLOG, standing).size, 0, 'and a blog conversation’s is not');

  const drawn = checkByProject(checkWithMarks([{ name: 'blog-1', actions: projectActions(BLOG, actions('.env')) }], {
    standing, lines: markLines(records), unreadable: false, nameOf: (id) => id, keepNotes: true,
  }), named);
  assert.deepEqual(drawn.rows.map((row) => [row.path, row.project?.name, row.reopened]), [['.env', 'blog', undefined]], 'blog’s .env is not app’s mark');
  assert.deepEqual(drawn.history?.map((line) => [line.path, line.project?.name, line.reopened]), [['.env', 'app', false]]);
});
