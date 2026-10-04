// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { denyEntriesFor, denyEntriesIn, fileRulesIn, isDenied, withDenyEntries } from '../../../../src/adapter/claude-code/settings/deny-entries.ts';

const SETTINGS = { model: 'opus', permissions: { allow: ['Bash(ls:*)'], deny: ['Read(./.env*)', 'Bash(cat:*.env*)'] } };

// R4c: one pattern, both tools; `Bash(...)` is a command pattern and is never written.
test('a pattern becomes a Read and an Edit rule, in that order', () => {
  assert.deepEqual(denyEntriesFor('secrets/**'), ['Read(secrets/**)', 'Edit(secrets/**)']);
});

test('what is read back: every entry, and the ones that name a file', () => {
  assert.deepEqual(denyEntriesIn(SETTINGS), ['Read(./.env*)', 'Bash(cat:*.env*)']);
  assert.deepEqual(fileRulesIn(SETTINGS), ['Read(./.env*)']);
  assert.deepEqual(denyEntriesIn({ permissions: { deny: 'not a list' } }), []);
  assert.deepEqual(denyEntriesIn({}), []);
});

test('adding keeps every other key and rule, and adds nothing twice', () => {
  const next = withDenyEntries(SETTINGS, ['Read(*.pem)', 'Read(*.pem)', 'Read(./.env*)']);

  assert.deepEqual(next, {
    model: 'opus',
    permissions: { allow: ['Bash(ls:*)'], deny: ['Read(./.env*)', 'Bash(cat:*.env*)', 'Read(*.pem)'] },
  });
  assert.equal(withDenyEntries(SETTINGS, ['Read(./.env*)']), SETTINGS, 'nothing to add is the same object');
  assert.deepEqual(withDenyEntries({}, ['Read(*.pem)']), { permissions: { deny: ['Read(*.pem)'] } });
});

test('a pattern counts as denied only when every rule init writes for it is there', () => {
  assert.equal(isDenied({ permissions: { deny: ['Read(*.pem)'] } }, '*.pem'), false);
  assert.equal(isDenied({ permissions: { deny: ['Read(*.pem)', 'Edit(*.pem)'] } }, '*.pem'), true);
});
