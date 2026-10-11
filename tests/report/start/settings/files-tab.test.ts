// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { patternKind, rowKind } from '../../../../src/report/start/settings/files-tab.ts';

// `2026-10-09-the-file-not-its-name.md` FN7: a rule for a name holds every file of it - ten `exercise.py` for the course
// that reported it (FNB1) - and its row said *A private file* over the bare name. FN5: a path in the project, written
// `./a/b` and listed as read, `**` + `/a/b`, is one file or one folder, where it was *Private files that match*.
test('a row says whether its rule is one file, one folder, every one of a name, or whatever matches', () => {
  const kinds = Object.fromEntries([
    '**/exercise.py', 'exercise.py', '**/secrets/**',
    './lessons/a/exercise.py', '**/lessons/a/exercise.py', './lessons/a/**', '**/lessons/a/**',
    '~/.ssh/**', '~/notes/plan.md', '//Volumes/share/ledger.csv',
    '**/*.env', 'config/*.pem',
  ].map((pattern) => [pattern, patternKind(pattern)]));

  assert.deepEqual(kinds, {
    '**/exercise.py': 'name',
    'exercise.py': 'name',
    '**/secrets/**': 'nameFolder',
    './lessons/a/exercise.py': 'file',
    '**/lessons/a/exercise.py': 'file',
    './lessons/a/**': 'folder',
    '**/lessons/a/**': 'folder',
    '~/.ssh/**': 'folder',
    '~/notes/plan.md': 'file',
    '//Volumes/share/ledger.csv': 'file',
    '**/*.env': 'pattern',
    'config/*.pem': 'pattern',
  });
});

// FN14, FN15, FNB30: a place (what Block writes for a file at the root) is the one file or folder it names; a told
// `./notes.md` is the root's file alone; a Block rule `./notes.md` is every file of the name, as Claude Code applies it.
test('FN15: a row is named from its rule as written - a place one file, a told root entry one file, a rule of one name every file', () => {
  const row = (patterns: readonly string[], written: { readonly remove?: string; readonly untell?: readonly string[] }) => ({
    patterns, ...(written.remove === undefined ? {} : { remove: { rule: written.remove, file: 'local' as const } }), ...(written.untell === undefined ? {} : { untell: written.untell }),
  });
  assert.equal(rowKind(row(['**/notes.md'], { remove: '~/shop/notes.md' })), 'file');
  assert.equal(rowKind(row(['**/drafts/**'], { remove: '//Users/someone/shop/drafts/**' })), 'folder');
  assert.equal(rowKind(row(['**/notes.md'], { untell: ['./notes.md'] })), 'file');
  assert.equal(rowKind(row(['**/notes.md'], { remove: './notes.md' })), 'name', 'Claude Code holds every notes.md under it');
  assert.equal(rowKind(row(['**/drafts/**'], { remove: './drafts/**' })), 'nameFolder');
  assert.equal(rowKind(row(['**/notes.md'], {})), 'name');
});
