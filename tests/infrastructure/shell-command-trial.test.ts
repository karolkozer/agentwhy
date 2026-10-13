// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { realpath } from 'node:fs/promises';
import { ShellCommandTrial, tellingLine } from '../../src/infrastructure/shell-command-trial.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

/**
 * `2026-10-02-codex-approves-its-own-hook.md` AO14, AOB8: a command run as Codex runs a hook - `<shell> -lc` - on the real
 * operating system. `/bin/sh`, so no test reads the person's own profile.
 */
const trial = new ShellCommandTrial({ platform: process.platform, shell: '/bin/sh', environment: { ...process.env, AGENTWHY_TRIAL: 'yes' } });
const SHORT = 5_000;

test('a command that reads its input and exits 0 ran, with code 0', async (t) => {
  const folder = await writeSession(t, {});
  assert.deepEqual(await trial.run({ commandLine: 'read line; [ "$line" = "hello" ]', input: 'hello\n', folder, timeoutMs: SHORT }), { kind: 'ran', exitCode: 0, stderr: '' });
});

test('it runs in the folder it is given, with the environment it is given', async (t) => {
  const folder = await writeSession(t, {});
  const real = await realpath(folder);
  assert.deepEqual(await trial.run({ commandLine: `[ "$(pwd -P)" = "${real}" ] && [ "$AGENTWHY_TRIAL" = "yes" ]`, input: '', folder, timeoutMs: SHORT }), { kind: 'ran', exitCode: 0, stderr: '' });
});

test('a non-zero exit and a missing command are each an exit code, with the first line of what they said', async (t) => {
  const folder = await writeSession(t, {});
  assert.deepEqual(await trial.run({ commandLine: 'echo broken >&2; exit 3', input: '', folder, timeoutMs: SHORT }), { kind: 'ran', exitCode: 3, stderr: 'broken' });
  const missing = await trial.run({ commandLine: 'agentwhy-no-such-command refuse --codex', input: '{}', folder, timeoutMs: SHORT });
  assert.equal(missing.kind, 'ran');
  assert.equal(missing.kind === 'ran' ? missing.exitCode : undefined, 127);
  assert.match(missing.kind === 'ran' ? missing.stderr : '', /not found/);
});

test('a command past its time is timed out, and the trial does not wait for it', async (t) => {
  const folder = await writeSession(t, {});
  const started = Date.now();
  assert.deepEqual(await trial.run({ commandLine: 'sleep 5', input: '', folder, timeoutMs: 300 }), { kind: 'timed-out' });
  assert.ok(Date.now() - started < 3_000, `took ${Date.now() - started} ms`);
});

test('a shell that cannot start is not started; on Windows nothing is tried', async (t) => {
  const folder = await writeSession(t, {});
  const noShell = new ShellCommandTrial({ platform: process.platform, shell: '/no/such/shell', environment: process.env });
  assert.equal((await noShell.run({ commandLine: 'true', input: '', folder, timeoutMs: SHORT })).kind, 'not-started');
  const windows = new ShellCommandTrial({ platform: 'win32', environment: process.env });
  assert.deepEqual(await windows.run({ commandLine: 'true', input: '', folder, timeoutMs: SHORT }), { kind: 'not-tried' });
});

// `2026-10-13-the-node-a-hook-finds.md` NF5 (amends AO14), NFB2: what a Node under the floor wrote when it could not load
// the package, with a fictional path. The first line names a file; the fourth says what was wrong.
const COULD_NOT_LOAD = [
  'file:///Users/someone/.npm/_npx/0123456789abcdef/node_modules/@clack/core/dist/index.mjs:1',
  "import { styleText } from 'node:util';",
  '         ^^^^^^^^^',
  "SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'",
  '    at ModuleJob._instantiate (node:internal/modules/esm/module_job:123:21)',
].join('\n');

test('NF5: of what a failed command wrote, the line kept is the one that says why', async (t) => {
  assert.equal(tellingLine(COULD_NOT_LOAD), "SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'");
  assert.equal(tellingLine("node:internal/modules/cjs/loader:1228\n  throw err;\n  ^\n\nError [ERR_MODULE_NOT_FOUND]: Cannot find module '/x/cli.js'\n"), "Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/x/cli.js'");
  // Where nothing is an error's own message, the first line that is not blank - a shell's, npm's, NF3's own.
  assert.equal(tellingLine('\n\nzsh:1: command not found: npx\n'), 'zsh:1: command not found: npx');
  assert.equal(tellingLine('npm ERR! code E404\nnpm ERR! 404 Not Found'), 'npm ERR! code E404');
  const floor = 'agentwhy needs Node 22 or newer: this shell runs Node 16.18.0 (/usr/local/bin/node), and its PATH holds no newer one.';
  assert.equal(tellingLine(floor + '\n'), floor, 'NF3\'s line is said whole');
  assert.equal(tellingLine(''), '');
  assert.equal(tellingLine('Error: ' + 'x'.repeat(400)).length, 300, 'cut at 300, as before');

  // Through the real shell: the trial answers that line, not the first.
  const folder = await writeSession(t, { 'said.txt': COULD_NOT_LOAD + '\n' });
  assert.deepEqual(await trial.run({ commandLine: 'cat said.txt >&2; exit 1', input: '', folder, timeoutMs: SHORT }), {
    kind: 'ran', exitCode: 1, stderr: "SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'",
  });
});
