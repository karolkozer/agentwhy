// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeDetachedRun } from '../../src/infrastructure/node-detached-run.ts';

// `2026-11-24-open-agentwhy-from-the-chat.md` RO6: the one real-OS test of what the fake imitates.
async function scriptIn(t: TestContext, body: string): Promise<{ readonly folder: string; readonly script: string; readonly temporary: string }> {
  const folder = await realpath(await mkdtemp(join(tmpdir(), 'agentwhy-detached-')));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const script = join(folder, 'script.mjs');
  await writeFile(script, body);
  const temporary = join(folder, 'tmp');
  await mkdir(temporary);
  return { folder, script, temporary };
}

const eventually = async (read: () => Promise<string | undefined>): Promise<string | undefined> => {
  for (let tries = 0; tries < 100; tries += 1) {
    const text = await read();
    if (text !== undefined) return text;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return undefined;
};

test('RO6: a run that ends in time gives its exit code and all it printed, with its arguments and in its folder', async (t) => {
  const { folder, script, temporary } = await scriptIn(t, "process.stdout.write(process.argv.slice(2).join(' ') + '|' + process.cwd()); process.exitCode = 3;");
  const shop = join(folder, 'my shop');
  await mkdir(shop);

  const answer = await new NodeDetachedRun(process.execPath, script, temporary).run(['start', '--detach'], shop, 10_000);

  assert.deepEqual(answer, { ended: true, exitCode: 3, output: `start --detach|${shop}` });
  assert.deepEqual(await readdir(temporary), [], 'what it printed is not kept: the address holds the page\'s token');
});

test('RO6: a run slower than the wait is left to go on, prints to nobody and is not broken by it', async (t) => {
  const { folder, script, temporary } = await scriptIn(t, `
    import { writeFileSync } from 'node:fs';
    setTimeout(() => { process.stdout.write('late\\n'); writeFileSync(${JSON.stringify('MARKER')}, 'went on'); }, 600);`);

  const began = Date.now();
  const answer = await new NodeDetachedRun(process.execPath, script, temporary).run([], folder, 100);

  assert.deepEqual(answer, { ended: false });
  assert.ok(Date.now() - began < 500, 'the wait ends when it says');
  assert.deepEqual(await readdir(temporary), []);
  assert.equal(await eventually(() => readFile(join(folder, 'MARKER'), 'utf8').catch(() => undefined)), 'went on');
});

test('RO6: a folder that is gone starts nothing', async (t) => {
  const { folder, script, temporary } = await scriptIn(t, '');
  assert.equal(await new NodeDetachedRun(process.execPath, script, temporary).run([], join(folder, 'gone'), 1000), undefined);
  assert.deepEqual(await readdir(temporary), []);
});

test('RO6: with no script to run, or nowhere to keep what it prints, nothing is started', async (t) => {
  const { folder, script } = await scriptIn(t, '');
  assert.equal(await new NodeDetachedRun(process.execPath, undefined).run([], folder, 1000), undefined);
  assert.equal(await new NodeDetachedRun(process.execPath, script, join(folder, 'gone')).run([], folder, 1000), undefined);
});
