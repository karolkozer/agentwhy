// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runCli } from '../helpers/cli.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL('../../src/cli.ts', import.meta.url));

/** Runs a hook's command as Copilot does (§2a d1, f1): through a shell, its input on stdin, in the session's folder. */
async function asCopilotRuns(command: string, input: object, cwd: string): Promise<{ code: number; stdout: string }> {
  const running = execFileAsync('/bin/bash', ['-c', command], { cwd, env: { PATH: '/usr/bin:/bin' } });
  running.child.stdin?.end(JSON.stringify(input));
  try {
    const { stdout } = await running;
    return { code: 0, stdout };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string };
    return { code: failure.code ?? -1, stdout: failure.stdout ?? '' };
  }
}

// `2026-10-09-copilot-blocks-too.md` CB9, CB19, CBD9: `init` on a computer that uses Copilot writes its check by absolute
// paths, and the command it wrote refuses a blocked file with nothing on the hook's PATH but the system's own folders.
test('init --refuse --yes writes Copilot\'s check, and the command it wrote refuses a blocked file from a bare PATH', async (t) => {
  const project = await writeSession(t, { '.env': 'KEY=not-a-real-value\n', 'README.md': '# shop\n' });
  const home = await writeSession(t, { '.copilot/config.json': '{}\n' });

  const result = await runCli(['init', '--refuse', '--yes'], { cwd: project, env: { HOME: home } });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Copilot: agentwhy's check is in ~\/\.copilot\/hooks\/agentwhy\.json\./);

  const file = JSON.parse(await readFile(join(home, '.copilot', 'hooks', 'agentwhy.json'), 'utf8')) as { hooks: { PreToolUse: Array<{ command: string }> } };
  const [entry] = file.hooks.PreToolUse;
  assert.equal(entry?.command, `'${process.execPath}' '${CLI}' refuse --copilot || agentwhy refuse --copilot || true`, 'this Node and this agentwhy, by absolute paths, then agentwhy on PATH');

  const read = (path: string) => ({ hook_event_name: 'PreToolUse', cwd: project, tool_name: 'Read', tool_input: { path } });
  const refused = await asCopilotRuns(entry.command, read(join(project, '.env')), project);
  assert.equal(refused.code, 0);
  assert.equal((JSON.parse(refused.stdout) as { permissionDecision: string }).permissionDecision, 'deny');
  assert.deepEqual(await asCopilotRuns(entry.command, read(join(project, 'README.md')), project), { code: 0, stdout: '' });
});

test('init on a computer without Copilot says nothing of it and writes nothing there', async (t) => {
  const project = await writeSession(t, {});
  const home = await writeSession(t, {});
  const result = await runCli(['init', '--refuse', '--yes'], { cwd: project, env: { HOME: home } });
  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Copilot/);
  const alone = await runCli(['init', '--copilot', '--yes'], { cwd: project, env: { HOME: home } });
  assert.equal(alone.code, 2);
  assert.equal(alone.stdout, 'Copilot: there is no ~/.copilot folder, so Copilot is not used on this computer and nothing was written for it.\n');
});

// CBD9's fallback: a check whose program is gone, with no agentwhy on PATH, lets Copilot's call run rather than refusing
// every one (§2a c5).
test('the command init wrote, with its agentwhy gone, ends in exit 0 with nothing written', async (t) => {
  const project = await writeSession(t, { '.env': 'KEY=x\n' });
  const gone = `'${process.execPath}' '/Users/someone/nowhere/cli.js' refuse --copilot || agentwhy refuse --copilot || true`;
  const run = await asCopilotRuns(gone, { hook_event_name: 'PreToolUse', cwd: project, tool_name: 'Bash', tool_input: { command: 'cat .env' } }, project);
  assert.deepEqual(run, { code: 0, stdout: '' });
});
