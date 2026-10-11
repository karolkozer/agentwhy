// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { projectPlaces } from '../../../src/report/start/places-in-project.ts';

const PROJECT = '/Users/someone/course';

// `2026-10-09-the-file-not-its-name.md` FN12 (FND8, FNB22): a file picked in the system's own window arrives as its
// path, written as the rule FN5 writes, and nobody is asked which file they meant again.
test('a place inside the project is the pick it is, written as its rule', () => {
  const { places, outside } = projectPlaces([
    { path: PROJECT + '/lessons/stage_02/02_tuples/exercise.py', folder: false },
    { path: PROJECT + '/lessons/stage_02', folder: true },
  ], PROJECT);
  assert.deepEqual(places, [
    { name: 'lessons/stage_02/02_tuples/exercise.py', kind: 'file', pattern: './lessons/stage_02/02_tuples/exercise.py' },
    { name: 'lessons/stage_02', kind: 'folder', pattern: './lessons/stage_02/**' },
  ]);
  assert.deepEqual(outside, []);
});

test('a place outside the project is named, not written - the project folder itself too', () => {
  const { places, outside } = projectPlaces([
    { path: '/Users/someone/Downloads/exercise.py', folder: false },
    { path: PROJECT, folder: true },
    { path: '/', folder: true },
  ], PROJECT);
  assert.deepEqual(places, []);
  assert.deepEqual(outside, ['exercise.py', 'course', '/']);
});

// The review of 2026-10-09 found `..env.backup` taken for a climb out of the project; the same reading holds here.
test('a name that only starts with two dots is a file of the project', () => {
  const { places, outside } = projectPlaces([{ path: PROJECT + '/..env.backup', folder: false }], PROJECT);
  assert.deepEqual(places, [{ name: '..env.backup', kind: 'file', pattern: './..env.backup' }]);
  assert.deepEqual(outside, []);
});
