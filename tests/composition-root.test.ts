// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { projectDirectoryName } from '../src/adapter/claude-code/contract/projects.ts';
import { createCommandRouter, type Environment } from '../src/composition-root.ts';
import { writeSession } from './helpers/synthetic-session.ts';

/**
 * The environment the shell would build, with a person at the terminal or not. The e2e tests run the CLI through
 * pipes, so they only ever see `interactive: false`; this is where the other side of R72 is wired and tested.
 */
async function environment(t: TestContext, interactive: boolean): Promise<Environment> {
  const home = await writeSession(t, {});
  return {
    // A folder of its own: a run in the home directory is no project (which-project V6), and says so instead of starting.
    workingDirectory: await writeSession(t, {}),
    home,
    platform: process.platform,
    temporaryDirectory: await writeSession(t, {}),
    user: undefined,
    interactive,
    inputIsTerminal: interactive,
    colour: false,
    terminal: false,
    columns: undefined,
    input: new PassThrough() as unknown as NodeJS.ReadStream,
    output: new PassThrough() as unknown as NodeJS.WriteStream,
    now: Date.now(),
  };
}

// worth-running-every-day R72: at a terminal, a bare `agentwhy` is `start`, and what begins with a dash reaches it.
// Neither run can open or serve: the project holds no session and has been through the onboarding - an empty project
// that has not opens the onboarding and serves it (onboarding W1a) - and a `--since` that means nothing stops `start`
// before it reads one. Only `start` answers with its own words and its own usage, so either answer means it ran.
// Wired to `menu` instead, the run would wait for a pick that never comes; the timeout turns that into a failure.
test('at a terminal, agentwhy alone is start, and a flag in place of a command reaches it', { timeout: 10_000 }, async (t) => {
  const env = await environment(t, true);
  await mkdir(join(env.home, '.agentwhy'), { recursive: true });
  await writeFile(join(env.home, '.agentwhy', 'onboarding.jsonl'), JSON.stringify({ kind: 'done', project: projectDirectoryName(env.workingDirectory), at: 1 }) + '\n');
  const router = createCommandRouter(env);

  const bare = await router.route([]);
  const flagged = await router.route(['--since', 'nonsense']);

  assert.equal(bare.kind, 'completed', JSON.stringify(bare));
  // W1a: a run that would open a page names no command in an empty project, since its reader cannot run one.
  assert.equal((bare.kind === 'completed' ? bare.output : '').split('. Work')[0], `You're set up. There are no AI chats in ${basename(env.workingDirectory)} yet`, 'the folder by name (which-project V3)');
  assert.equal(flagged.kind, 'usage-error', JSON.stringify(flagged));
  assert.match(flagged.kind === 'usage-error' ? flagged.message : '', /^--since takes a span .*: nonsense$/);
  assert.match(flagged.kind === 'usage-error' ? flagged.usage : '', /^Usage: agentwhy start /);
});

// R73: with no one at a terminal there is no default, so nothing is opened or served.
test('with no terminal, agentwhy alone has no default and flags are not forwarded', async (t) => {
  const router = createCommandRouter(await environment(t, false));

  assert.deepEqual(
    [await router.route([]), await router.route(['--no-open'])].map((result) => result.kind === 'usage-error' && result.message),
    ['missing command', 'unknown command: --no-open'],
  );
});
