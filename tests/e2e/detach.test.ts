// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECTS_DIRECTORY, projectDirectoryName } from '../../src/adapter/claude-code/contract/projects.ts';
import { runCli } from '../helpers/cli.ts';
import { jsonl, writeSession } from '../helpers/synthetic-session.ts';

// `2026-10-02-a-page-not-a-file.md` PF2, PF3 and PF7, through the command and a real server in the background: the record
// names the version that serves, and a second `--detach` of that version is handed the same server.

const SESSION_ID = '7a1c2b3d-4e5f-4061-8728-394a5b6c7d8e';

async function aProject(t: TestContext): Promise<{ readonly project: string; readonly home: string }> {
  const project = await realpath(await writeSession(t, { 'package.json': '{}' }));
  const home = await realpath(await writeSession(t, {}));
  const stored = join(home, ...PROJECTS_DIRECTORY, projectDirectoryName(project));
  await mkdir(stored, { recursive: true });
  const now = new Date().toISOString();
  await writeFile(join(stored, `${SESSION_ID}.jsonl`), jsonl(
    { type: 'user', sessionId: SESSION_ID, cwd: project, timestamp: now, message: { role: 'user', content: 'Look at the shop.' } },
    { type: 'assistant', sessionId: SESSION_ID, cwd: project, timestamp: now, message: { role: 'assistant', content: [{ type: 'text', text: 'Looked.' }] } },
  ));
  return { project, home };
}

test('PF2, PF7: a served run records its version, and a second --detach of that version is handed the same server', async (t) => {
  const { project, home } = await aProject(t);
  const env = { HOME: home };
  const first = await runCli(['start', '--detach', '--no-open', '--quiet'], { cwd: project, env });
  const servers = join(home, '.agentwhy', 'servers');
  const [name] = await readdir(servers);
  const record = JSON.parse(await readFile(join(servers, name as string), 'utf8')) as { url: string; pid: number; version?: string };
  // The server in the background stops by itself after 30 minutes; a test stops it now.
  t.after(() => { try { process.kill(record.pid); } catch { /* already gone */ } });

  const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
  assert.equal(first.code, 0, first.stderr);
  assert.equal(record.version, version, 'the record names the agentwhy that serves');
  assert.ok(first.stdout.startsWith(`Serving: ${record.url}`), first.stdout);

  const second = await runCli(['start', '--detach', '--no-open', '--quiet'], { cwd: project, env });
  assert.equal(second.code, 0, second.stderr);
  assert.equal(second.stdout.split('/').slice(0, 4).join('/'), first.stdout.split('/').slice(0, 4).join('/'), 'the same server and token');
  assert.equal((await readdir(servers)).length, 1);
});
