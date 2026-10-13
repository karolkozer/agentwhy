// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { chmod, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newerNodeOn, runUnderNewerNode, UNDER_NEWER_NODE } from '../../src/infrastructure/newer-node.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

// `.ai/specs/2026-10-13-the-node-a-hook-finds.md` NF2, on the real operating system: each `node` here is a shell script
// that answers a version, as a Node would be asked, and otherwise leaves a line saying how it was run.
const POSIX = process.platform !== 'win32';

/** A folder holding a `node` that says it is `version`, and run with a script writes its arguments to `ran.txt` and exits `exit`. */
async function nodeSaying(root: string, name: string, version: string, exit = 0): Promise<string> {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  const file = join(directory, 'node');
  await writeFile(file, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${version}"; exit 0; fi\nprintf '%s\\n' "$*" "$${UNDER_NEWER_NODE}" > "${join(directory, 'ran.txt')}"\nexit ${exit}\n`);
  await chmod(file, 0o755);
  return directory;
}

test('NF2: the first node on PATH at the floor is the one, in PATH\'s order', { skip: !POSIX }, async (t) => {
  const root = await realpath(await writeSession(t, {}));
  const old = await nodeSaying(root, 'old', 'v16.18.0');
  const loads = await nodeSaying(root, 'twenty', 'v20.17.0');
  const first = await nodeSaying(root, 'first', 'v22.12.0');
  const second = await nodeSaying(root, 'second', 'v24.13.1');
  const search = (path: string) => newerNodeOn({ path, platform: process.platform, running: join(old, 'node') });

  assert.equal(search([old, loads, first, second].join(':')), join(first, 'node'), 'neither the old one nor one under the floor');
  assert.equal(search([second, first].join(':')), join(second, 'node'), 'the order is PATH\'s, not the newest');
  assert.equal(search([old, loads, join(root, 'no-such-folder')].join(':')), undefined);
  assert.equal(newerNodeOn({ path: undefined, platform: process.platform, running: join(old, 'node') }), undefined);
});

test('NF2: only folders a shell would look in and nobody added for one run are asked', { skip: !POSIX }, async (t) => {
  const root = await realpath(await writeSession(t, {}));
  const old = await nodeSaying(root, 'old', 'v16.18.0');
  const npx = await nodeSaying(root, join('project', 'node_modules', '.bin'), 'v24.13.1');
  const good = await nodeSaying(root, 'good', 'v22.12.0');
  const broken = await nodeSaying(root, 'broken', 'node: bad option: --version');
  const search = (path: string, running = join(old, 'node')) => newerNodeOn({ path, platform: process.platform, running });

  assert.equal(search([npx, good].join(':')), join(good, 'node'), 'JB2: a node_modules folder is npx\'s own, for the length of its run');
  assert.equal(search(['', '.', 'relative/bin', npx].join(':')), undefined, 'an empty entry and a relative one name the folder a hook runs in');
  assert.equal(search([broken, good].join(':')), join(good, 'node'), 'what does not answer a version is passed over');
  assert.equal(search([good].join(':'), join(good, 'node')), undefined, 'the Node running now is not asked again');
});

test('NF2: the same script and arguments run under it, marked, and its exit code is the answer', { skip: !POSIX }, async (t) => {
  const root = await realpath(await writeSession(t, {}));
  const old = await nodeSaying(root, 'old', 'v16.18.0');
  const blocks = await nodeSaying(root, 'blocks', 'v22.12.0', 2);
  const SCRIPT = '/tools/agentwhy/dist/cli.js';
  const run = (environment: Readonly<Record<string, string | undefined>>, script: string | undefined) => runUnderNewerNode({
    path: [old, blocks].join(':'), platform: process.platform, running: join(old, 'node'), script, args: ['refuse', '--codex'], environment,
  });

  assert.equal(run({ PATH: [old, blocks].join(':') }, SCRIPT), 2, 'a refusal\'s 2 is still a 2');
  assert.deepEqual((await readFile(join(blocks, 'ran.txt'), 'utf8')).split('\n').slice(0, 2), ['/tools/agentwhy/dist/cli.js refuse --codex', '1'], 'the script as it was started, its arguments, and the mark');
  assert.equal(run({ [UNDER_NEWER_NODE]: '1' }, SCRIPT), undefined, 'a run started this way does not look again');
  assert.equal(run({}, undefined), undefined, 'with no script there is nothing to run');
  assert.equal(runUnderNewerNode({ path: old, platform: process.platform, running: join(old, 'node'), script: '/tools/cli.js', args: [], environment: {} }), undefined, 'no newer Node: nothing ran');
});

test('NFO2, written and not measured: on Windows the name is node.exe and PATH is split at a semicolon', () => {
  // No such folder exists here, so nothing is run: only that a Windows PATH is read as one, and a POSIX one is not.
  assert.equal(newerNodeOn({ path: 'C:\\Program Files\\nodejs;C:\\Users\\someone\\AppData\\Roaming\\npm', platform: 'win32', running: 'C:\\old\\node.exe' }), undefined);
});
