// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { codexOnThisComputer } from '../../../../src/adapter/codex/discovery/codex-on-this-computer.ts';
import type { DirectoryReader, EntryKind } from '../../../../src/ports/directory-reader.ts';
import { FileAccessError } from '../../../../src/ports/file-access-error.ts';

const HOME = '/Users/someone';

function directoriesWith(entries: Readonly<Record<string, EntryKind | 'unreadable'>>): DirectoryReader {
  const refuse = async (path: string): Promise<never> => {
    throw new FileAccessError('not-found', path);
  };
  return {
    kindOf: async (path) => {
      const kind = entries[path];
      if (kind === undefined) throw new FileAccessError('not-found', path);
      if (kind === 'unreadable') throw new FileAccessError('unreadable', path);
      return kind;
    },
    list: refuse,
    modifiedAt: refuse,
  };
}

// codex-blocks-too CK6, amended 2026-10-01: Codex's own folder in the home directory, and nothing else, says it is used here.
test('Codex is used on this computer where its folder is in the home directory', async () => {
  assert.equal(await codexOnThisComputer(directoriesWith({ '/Users/someone/.codex': 'directory' }), HOME), true);
  assert.equal(await codexOnThisComputer(directoriesWith({}), HOME), false, 'no folder');
  assert.equal(await codexOnThisComputer(directoriesWith({ '/Users/someone/.codex': 'file' }), HOME), false, 'a file of that name is not Codex’s');
  assert.equal(await codexOnThisComputer(directoriesWith({ '/Users/someone/.codex': 'unreadable' }), HOME), false, 'what cannot be looked at is not taken as Codex');
  assert.equal(await codexOnThisComputer(directoriesWith({ '/Users/someone/project/.codex': 'directory' }), HOME), false, 'a project’s own folder is not the computer’s');
});
