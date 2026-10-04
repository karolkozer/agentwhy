// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { DirectoryReader, EntryKind } from '../../../src/ports/directory-reader.ts';
import { FileAccessError } from '../../../src/ports/file-access-error.ts';
import { repositoryAbove } from '../../../src/report/start/repository.ts';

function directoriesWith(entries: Readonly<Record<string, EntryKind>>): DirectoryReader {
  return {
    kindOf: async (path) => {
      const kind = entries[path];
      if (kind === undefined) throw new FileAccessError('not-found', path);
      return kind;
    },
    list: async (path) => {
      throw new FileAccessError('not-found', path);
    },
    modifiedAt: async (path) => {
      throw new FileAccessError('not-found', path);
    },
  };
}

// `--out ./reports` inside a repository is inside it, whether or not ./reports exists yet.
test('a directory below a working tree, existing or not, is inside it', async () => {
  const directories = directoriesWith({ '/work/repo/.git': 'directory' });

  assert.equal(await repositoryAbove('/work/repo/reports/new', directories), '/work/repo');
});

// That is how a worktree records where it belongs.
test('a .git file counts as much as a .git directory', async () => {
  const directories = directoriesWith({ '/work/tree/.git': 'file' });

  assert.equal(await repositoryAbove('/work/tree/out', directories), '/work/tree');
});

test('a directory under no working tree is under none', async () => {
  assert.equal(await repositoryAbove('/tmp/agentwhy-start', directoriesWith({})), undefined);
});
