// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { WorkingDirectoryCollector } from '../../../../../src/adapter/claude-code/probe/collectors/working-directory-collector.ts';
import { lineOf, unparsableLine } from '../../../../helpers/transcript-line.ts';

test('counts how many different working directories a session carries, never which', () => {
  const collector = new WorkingDirectoryCollector();

  for (const json of [{ cwd: '/a/project' }, { cwd: '/a/project' }, { cwd: '/another/project' }, {}]) {
    collector.collect(lineOf(json));
  }
  collector.collect(unparsableLine('{"cwd":"/a/project"'));

  assert.deepEqual(collector.stats(), { distinct: 2, invalid: 0 });
});

test('a cwd that is not a string is counted as invalid rather than taken for a directory', () => {
  const collector = new WorkingDirectoryCollector();

  for (const json of [{ cwd: 7 }, { cwd: null }, { cwd: ['/a/project'] }, { cwd: '/a/project' }]) {
    collector.collect(lineOf(json));
  }

  assert.deepEqual(collector.stats(), { distinct: 1, invalid: 3 });
});

test('a session whose lines carry no cwd has no working directory at all', () => {
  const collector = new WorkingDirectoryCollector();

  collector.collect(lineOf({ type: 'bridge-session' }));

  assert.deepEqual(collector.stats(), { distinct: 0, invalid: 0 });
});
