// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNode } from '../helpers/cli.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * This project's source and manifest in a folder of their own, with no `node_modules` anywhere above it - the way the
 * plugin is installed where its files are copied without their dependencies, and the only way an upload to the account
 * takes it, since an archive with `node_modules/@clack/…` is refused for the `@` (`2026-10-15-agentwhy-as-a-plugin.md`
 * §8.3, APD2).
 */
async function withoutPackages(t: TestContext): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'agentwhy-no-packages-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await cp(join(ROOT, 'src'), join(folder, 'src'), { recursive: true });
  await cp(join(ROOT, 'package.json'), join(folder, 'package.json'));
  return join(folder, 'src', 'cli.ts');
}

const shell = (command: string) =>
  JSON.stringify({ session_id: 's', cwd: '/work/the-app', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });

// APD2: a hook that cannot load ends with code 1, an error and not a block, and the call goes on (NFB6). Measured on the
// probe: every command loaded `@clack/prompts`, which only a question needs, so with no `node_modules` none started.
test('without node_modules: refuse still runs and still refuses', async (t) => {
  const cli = await withoutPackages(t);

  const result = await runNode(cli, ['refuse'], { input: shell('cat .env') });

  assert.equal(result.code, 2, result.stderr);
  assert.match(result.stderr, /^agentwhy refused this command: it names \.env,/);
});

test('without node_modules: watch still runs, and a turn it cannot read ends with code 0', async (t) => {
  const cli = await withoutPackages(t);

  const result = await runNode(cli, ['watch'], {
    input: JSON.stringify({ session_id: 's', transcript_path: '/work/none.jsonl', cwd: '/work/the-app', hook_event_name: 'Stop', stop_hook_active: false }),
  });

  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
});
