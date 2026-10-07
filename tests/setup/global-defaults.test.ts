// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DEFAULT_POLICY } from '../../src/core/policy/default-policy.ts';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.ts';
import type { DirectoryReader } from '../../src/ports/directory-reader.ts';
import { FileAccessError } from '../../src/ports/file-access-error.ts';
import { defaultsOnThisComputer, globalDefaults } from '../../src/setup/global-defaults.ts';
import { patternsOf } from '../../src/setup/protected-patterns.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

const present = (rows: readonly { id: string; present: boolean }[]) => rows.filter((row) => row.present).map((row) => row.id);

// `2026-10-05-protected-everywhere.md` GD14: the rows, in the order a page lists them, for macOS and Windows both - and
// `2026-10-07-a-file-in-its-place.md` IP6: each where it lives under the home, the form that holds wherever the AI works
// (IPB6, IPB11), with the anchored form GD3 wrote before kept to know a row written then by (IPD1). Windows keeps GD3's
// form until `~/` is measured there (IPB13).
test('the rows name each tool where its own system keeps it: a place on macOS, anchored on Windows', () => {
  assert.deepEqual(globalDefaults('darwin').map((row) => [row.pattern, row.legacy]), [
    ['~/.ssh/**', '**/.ssh/**'],
    ['~/.aws/**', '**/.aws/**'],
    ['~/.azure/**', '**/.azure/**'],
    ['~/.config/gcloud/**', '**/.config/gcloud/**'],
    ['~/.config/gh/**', '**/.config/gh/**'],
    ['~/.git-credentials', '**/.git-credentials'],
    ['~/.gnupg/**', '**/.gnupg/**'],
    ['~/.kube/**', '**/.kube/**'],
    ['~/.docker/config.json', '**/.docker/config.json'],
    ['~/.netrc', '**/.netrc'],
  ]);
  assert.deepEqual(globalDefaults('win32').map((row) => row.pattern), [
    '**/.ssh/**',
    '**/.aws/**',
    '**/.azure/**',
    '**/AppData/Roaming/gcloud/**',
    '**/AppData/Roaming/GitHub CLI/**',
    '**/.git-credentials',
    '**/AppData/Roaming/gnupg/**',
    '**/.kube/**',
    '**/.docker/config.json',
    '**/_netrc',
  ]);
  assert.deepEqual(globalDefaults('linux'), globalDefaults('darwin'), 'every system but Windows keeps them where macOS does');
  for (const row of globalDefaults('win32')) {
    assert.deepEqual(patternsOf([row.pattern]).refused, [], `${row.pattern} is a pattern GlobalSetup writes as it is`);
  }
});

// GD14's reason for its list: a global rule cannot be lifted (G15), so nothing a project keeps of its own is a default.
test('nothing a project keeps of its own is a computer-wide default', () => {
  const patterns = new Set([...globalDefaults('darwin'), ...globalDefaults('win32')].map((row) => row.pattern));
  for (const per of ['**/.env*', '**/*.env', '**/*.pem', '**/secrets/**', '**/.npmrc']) {
    assert.equal(patterns.has(per), false, per);
  }
  // `.ssh` is the one both lists share on Windows, still anchored there: it is in no project, and the built-in list names
  // it for the project's own sake. On macOS the computer's is the home's own `.ssh` (IP6), and no project's.
  const shared = DEFAULT_POLICY.protected.map((entry) => entry.pattern).filter((pattern) => patterns.has(pattern));
  assert.deepEqual(shared, ['**/.ssh/**']);
  assert.equal(globalDefaults('win32').some((row) => row.legacy !== undefined), false, 'nothing to bring along on Windows');
});

test('the rows whose path is on this computer are found, and only those', async (t) => {
  const mac = await writeSession(t, {
    '.ssh/id_ed25519': 'not read',
    '.aws/credentials': 'not read',
    '.config/gh/hosts.yml': 'not read',
    '.docker/config.json': '{}',
    '.netrc': 'not read',
  });
  assert.deepEqual(present(await defaultsOnThisComputer(new NodeFileSystem(), mac, 'darwin')), ['ssh', 'aws', 'github', 'docker', 'netrc']);

  const windows = await writeSession(t, { 'AppData/Roaming/GitHub CLI/hosts.yml': 'not read', '_netrc': 'not read', '.netrc': 'not read' });
  assert.deepEqual(present(await defaultsOnThisComputer(new NodeFileSystem(), windows, 'win32')), ['github', 'netrc']);
  assert.deepEqual(present(await defaultsOnThisComputer(new NodeFileSystem(), windows, 'darwin')), ['netrc'], 'the other system\'s places are not looked in');
});

// Nothing in a credentials file is read to tell whether it is there: the question goes to the directory tree alone.
test('presence is asked of the directory tree, and an error the port does not name is not swallowed', async () => {
  const asked: string[] = [];
  const tree: DirectoryReader = {
    kindOf: async (path) => {
      asked.push(path);
      if (path.endsWith('.kube')) throw new Error('a disk that failed');
      throw new FileAccessError('not-found', path);
    },
    list: async () => assert.fail('nothing is listed'),
    modifiedAt: async () => assert.fail('no time is asked'),
  };

  await assert.rejects(defaultsOnThisComputer(tree, '/home/someone', 'linux'), /a disk that failed/);
  assert.equal(asked.length, 10, 'each row asked once');
  assert.ok(asked.includes('/home/someone/.docker/config.json'));
});

// A path that is there but cannot be looked at is ticked: a needless tick blocks nothing used, a missed one nothing.
test('a path that could not be looked at counts as there; only one that is not there folds', async () => {
  const tree: DirectoryReader = {
    kindOf: async (path) => {
      if (path.endsWith('.gnupg')) throw new FileAccessError('unreadable', path);
      if (path.endsWith('.ssh')) return 'other';
      throw new FileAccessError('not-found', path);
    },
    list: async () => assert.fail('nothing is listed'),
    modifiedAt: async () => assert.fail('no time is asked'),
  };

  assert.deepEqual(present(await defaultsOnThisComputer(tree, '/home/someone', 'darwin')), ['ssh', 'gnupg']);
});
