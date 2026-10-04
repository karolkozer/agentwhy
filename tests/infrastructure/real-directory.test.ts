// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realDirectory } from '../../src/infrastructure/real-directory.ts';

// which-project V6, found by a review: HOME may reach the working directory through a link.
test('a directory reached through a link is named as the system names it', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'agentwhy-real-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'data', 'someone'), { recursive: true });
  await symlink(join(root, 'data'), join(root, 'home'), 'dir');

  assert.equal(realDirectory(join(root, 'home', 'someone')), join(root, 'data', 'someone'));
  assert.equal(realDirectory(join(root, 'data', 'someone')), join(root, 'data', 'someone'));
});

test('a path that cannot be followed stays as it was given, and an empty one names no directory', () => {
  assert.equal(realDirectory('/Users/someone/not-there'), '/Users/someone/not-there');
  assert.equal(realDirectory(''), '', 'not the directory the process stands in');
});
