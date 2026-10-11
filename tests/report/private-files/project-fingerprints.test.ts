// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import type { Policy } from '../../../src/core/policy/policy.ts';
import { NodeFileSystem } from '../../../src/infrastructure/node-file-system.ts';
import type { DirectoryReader } from '../../../src/ports/directory-reader.ts';
import { ProjectFingerprints } from '../../../src/report/private-files/project-fingerprints.ts';
import { writeSession } from '../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
const LINES = 'colors = ["purple", "teal", "amber"]\nprint("Last colour in the list:", colors[-1])\n';
const TRACKED: Policy = { protected: [{ pattern: '**/lessons/01/exercise.py', mode: 'tell' }], allowed: [] } as unknown as Policy;

/** A directory reader that counts its listings, so a second asking is seen to walk nothing. */
function counting(directories: DirectoryReader): DirectoryReader & { readonly lists: () => number } {
  let lists = 0;
  return {
    kindOf: (path) => directories.kindOf(path),
    modifiedAt: (path) => directories.modifiedAt(path),
    list: async (path) => { lists += 1; return directories.list(path); },
    lists: () => lists,
  };
}

// `2026-10-11-the-file-by-its-text.md` CT2, CT3, CT7: the project's private files, walked once a run; a file in a folder a
// program writes, a binary file and one past 512 KB are known by no text.
test('the project\'s private files are known by their text, once a run, and only the ones it may read', async (t) => {
  const root = await writeSession(t, {
    'lessons/01/exercise.py': LINES,
    'lessons/02/exercise.py': 'numbers = [4, 8, 15, 16, 23, 42] # the slicing lesson\n',
    'node_modules/lessons/01/exercise.py': LINES,
    'lessons/01/blob.py': 'a line long enough to be read as text\u0000\n',
    'lessons/01/huge.py': `${'a long line of a generated file, read past its limit\n'.repeat(12_000)}`,
  });
  const directories = counting(files);
  const fingerprints = new ProjectFingerprints({ directories, files, salt: 'test' });
  const known = await fingerprints.of({ kind: 'known', path: root }, TRACKED);
  assert.equal(known?.files, 1, 'node_modules is not walked: its copy would have made both lines no file\'s own');
  assert.deepEqual(known?.filesShown([LINES]), [join(root, 'lessons/01/exercise.py')]);

  const walked = directories.lists();
  assert.equal(await fingerprints.of({ kind: 'known', path: root }, TRACKED), known, 'asked again, the same answer');
  assert.equal(directories.lists(), walked, 'and nothing walked again');

  const blocked = { protected: [{ pattern: '**/lessons/01/blob.py' }, { pattern: '**/lessons/01/huge.py' }], allowed: [] } as unknown as Policy;
  assert.equal((await fingerprints.of({ kind: 'known', path: root }, blocked))?.files ?? 0, 0, 'a binary file and a huge one are known by no text');
  assert.equal(await fingerprints.of({ kind: 'known', path: root }, { protected: [], allowed: [] } as unknown as Policy), undefined, 'no private file, nothing to know');
  assert.equal(await fingerprints.of({ kind: 'absent' }, TRACKED), undefined, 'no root, nothing walked');
});

test('a project past 20 000 files is walked no further, and no file is known by its text', async () => {
  const many: DirectoryReader = {
    kindOf: async () => 'directory',
    modifiedAt: async () => 0,
    list: async () => Array.from({ length: 20_001 }, (_, at) => ({ name: `f${at}.py`, kind: 'file' as const })),
  };
  const fingerprints = new ProjectFingerprints({ directories: many, files, salt: 'test' });
  assert.equal(await fingerprints.of({ kind: 'known', path: '/p' }, { protected: [{ pattern: '**/f1.py' }], allowed: [] } as unknown as Policy), undefined);
});
