// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { PROJECTS_DIRECTORY, projectDirectoryName } from '../../src/adapter/claude-code/contract/projects.ts';
import { runCli } from '../helpers/cli.ts';
import { jsonl, writeSession } from '../helpers/synthetic-session.ts';

const SESSION_ID = '9f3c2a71-5b8e-4d0f-a6c4-2e7b91d05c38';
const AGENT_ID = 'a3333333333333333';
const DELEGATION = 'toolu_01STARTSHAREAGENTAAAAAAA';

function call(cwd: string, tool: string, name: string, input: object, agent = false): object {
  return {
    type: 'assistant',
    isSidechain: agent,
    ...(agent ? { agentId: AGENT_ID } : {}),
    cwd,
    message: { role: 'assistant', content: [{ type: 'tool_use', id: tool, name, input }] },
  };
}

function result(cwd: string, tool: string, content: string, agent = false): object {
  return {
    type: 'user',
    isSidechain: agent,
    ...(agent ? { agentId: AGENT_ID } : {}),
    cwd,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tool, content }] },
  };
}

// findings-worth-reading criterion 12. getting-to-a-report recorded this as measured on a real project and never
// asserted: the shared view is a promise about files, so the test reads every file `start --share` wrote.
test('start --share writes no temporary path, no home, no project path and no identifier into any file', async (t) => {
  // Real paths: on macOS the temporary directory is reached through a symbolic link, and a child process reports
  // the resolved path as its working directory - which is the one the sessions are stored under.
  const project = await realpath(await writeSession(t, { 'package.json': '{}' }));
  const home = await realpath(await writeSession(t, {}));
  const out = await realpath(await writeSession(t, {}));

  // Paths inside the project, above it in the home directory, in a call, in a task description and in a result.
  const stored = join(home, ...PROJECTS_DIRECTORY, projectDirectoryName(project));
  const subagents = join(stored, SESSION_ID, 'subagents');
  await mkdir(subagents, { recursive: true });
  await writeFile(
    join(stored, `${SESSION_ID}.jsonl`),
    jsonl(
      call(project, 'toolu_01STARTSHAREREADAAAAAAAA', 'Read', { file_path: `${project}/apps/web/.env` }),
      result(project, 'toolu_01STARTSHAREREADAAAAAAAA', 'PORT=3000'),
      call(project, 'toolu_01STARTSHAREHOMEAAAAAAAA', 'Read', { file_path: `${home}/.ssh/id_rsa` }),
      result(project, 'toolu_01STARTSHAREHOMEAAAAAAAA', 'not shown'),
      call(project, DELEGATION, 'Agent', {
        description: `check ${project}/apps/web/.env.development against ${home}/notes`,
        prompt: 'find where the secret is configured',
        subagent_type: 'Explore',
      }),
      result(project, DELEGATION, 'done'),
    ),
  );
  await writeFile(
    join(subagents, `agent-${AGENT_ID}.jsonl`),
    jsonl(
      call(project, 'toolu_01STARTSHAREGREPAAAAAAAA', 'Bash', { command: `grep -rn SECRET ${project}/apps ${home}/elsewhere` }, true),
      result(
        project,
        'toolu_01STARTSHAREGREPAAAAAAAA',
        `${project}/apps/web/.env.development:3:SECRET=x\n${home}/elsewhere/.env:1:SECRET=y`,
        true,
      ),
    ),
  );
  await writeFile(
    join(subagents, `agent-${AGENT_ID}.meta.json`),
    JSON.stringify({ agentType: 'Explore', description: 'check the configuration', toolUseId: DELEGATION, spawnDepth: 1 }),
  );

  const { code, stdout, stderr } = await runCli(['start', '--share', '--no-open', '--out', out], {
    cwd: project,
    env: { HOME: home },
  });

  assert.equal(code, 0, `start failed: ${stdout}${stderr}`);
  const files = await readdir(out);
  assert.ok(files.includes('index.html'), 'the index was written');
  assert.ok(files.includes('session-1.html'), 'and the report of the one session, named by position');

  const forbidden = [
    ['the temporary directory', tmpdir()],
    ['the temporary directory, resolved', await realpath(tmpdir())],
    ['the home directory', home],
    ['the project path', project],
    ["the project directory's name", basename(project)],
    ['the session id', SESSION_ID],
    ['the agent id', AGENT_ID],
  ] as const;
  for (const file of files) {
    const text = await readFile(join(out, file), 'utf8');
    for (const [what, value] of forbidden) assert.ok(!text.includes(value), `${file} carries ${what}`);
  }
  // Not vacuous: the report is there, and what is inside the project is still named.
  const shared = await readFile(join(out, 'session-1.html'), 'utf8');
  assert.ok(shared.includes('apps/web/.env'), 'the report names the file');
  // `a-way-back` criterion 5: a shared report leads back to a shared index, which carries no titles either.
  assert.ok(shared.includes('href="index.html"'), 'and leads back to the index beside it');
});

/**
 * `a-way-back` criterion 4. The rejected design put every session's title into every report; this is the test that
 * would have caught it. A report is the file a person sends on because it is about one session, so it holds one.
 */
test('a report knows nothing of the other sessions in the same run', async (t) => {
  const project = await realpath(await writeSession(t, { 'package.json': '{}' }));
  const home = await realpath(await writeSession(t, {}));
  const out = await realpath(await writeSession(t, {}));
  const stored = join(home, ...PROJECTS_DIRECTORY, projectDirectoryName(project));
  await mkdir(stored, { recursive: true });

  const sessions = [
    { id: '11111111-1111-4111-8111-111111111111', title: 'Rotate the billing key' },
    { id: '22222222-2222-4222-8222-222222222222', title: 'Fix the login redirect' },
  ] as const;
  for (const session of sessions) {
    const tool = `toolu_01WAYBACK${session.id.slice(0, 4)}AAAAAAAAAAA`;
    await writeFile(
      join(stored, `${session.id}.jsonl`),
      jsonl(
        call(project, tool, 'Read', { file_path: `${project}/apps/web/.env` }),
        result(project, tool, 'PORT=3000'),
        { type: 'ai-title', aiTitle: session.title, sessionId: session.id },
      ),
    );
  }

  const { code, stdout, stderr } = await runCli(['start', '--no-open', '--out', out], { cwd: project, env: { HOME: home } });

  assert.equal(code, 0, `start failed: ${stdout}${stderr}`);
  const index = await readFile(join(out, 'index.html'), 'utf8');
  for (const session of sessions) assert.ok(index.includes(session.title), 'the index is the page that lists them all');

  for (const [mine, other] of [[sessions[0], sessions[1]], [sessions[1], sessions[0]]] as const) {
    const report = await readFile(join(out, `${mine.id}.html`), 'utf8');
    assert.ok(report.includes('href="index.html"'), 'each report leads back to the index');
    assert.ok(!report.includes(other.id), `${mine.id} carries the other session's id`);
    assert.ok(!report.includes(other.title), `${mine.id} carries the other session's title`);
  }
});
