// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeBackgroundRun } from '../../src/infrastructure/node-background-run.ts';

// PF3, the one real-OS test of what the fake imitates: started apart, given its arguments, and not waited for.
test('a background run starts apart from this process with its arguments, and returns its process id', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'agentwhy-background-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const script = join(folder, 'echo.mjs');
  const out = join(folder, 'out.txt');
  await writeFile(script, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(out)}, process.argv.slice(2).join(' '));`);

  const pid = await new NodeBackgroundRun(process.execPath, script).start(['start', '--serve']);

  assert.ok(Number.isInteger(pid) && pid !== process.pid);
  for (let tries = 0; tries < 50; tries += 1) {
    const written = await readFile(out, 'utf8').catch(() => undefined);
    if (written !== undefined) return assert.equal(written, 'start --serve');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail('the background run never wrote its arguments');
});

test('with no script to run, nothing is started', async () => {
  assert.equal(await new NodeBackgroundRun(process.execPath, undefined).start(['start']), undefined);
});

// Found by review: a process that ended - a sandbox, a refused port - is told apart from one still starting.
test('a background run that ended is no longer running', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'agentwhy-background-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const script = join(folder, 'ends.mjs');
  await writeFile(script, 'process.exit(1);');
  const background = new NodeBackgroundRun(process.execPath, script);

  const pid = await background.start([]);

  assert.ok(pid !== undefined);
  for (let tries = 0; tries < 100 && background.running(pid); tries += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(background.running(pid), false);
});
