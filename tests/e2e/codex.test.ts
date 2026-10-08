// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PROJECTS_DIRECTORY, projectDirectoryName } from '../../src/adapter/claude-code/contract/projects.ts';
import { runCli } from '../helpers/cli.ts';
import { cell, cellOutput, command, given, item, meta, ROOT, rolloutPath, said, TURN, turnContext } from '../helpers/codex-session.ts';
import { CANARY, jsonl, writeSession } from '../helpers/synthetic-session.ts';

// `2026-09-27-what-codex-wrote.md` X27, X28 and step 8 of its plan, end to end: one project with a conversation in each
// AI. The value is invented and assembled at run time; it and the canary must reach no output.
const CLAUDE_ID = '9f3c2a71-5b8e-4d0f-a6c4-2e7b91d05c39';
const VALUE = ['codex', 'orchid', '4821', CANARY].join('-');

async function world(t: TestContext): Promise<{ readonly project: string; readonly home: string; readonly rollout: string }> {
  // Real paths: a child process reports the resolved working directory, which is what both AIs record.
  const project = await realpath(await writeSession(t, { 'package.json': '{}' }));
  const home = await realpath(await writeSession(t, {}));
  const claude = join(home, ...PROJECTS_DIRECTORY, projectDirectoryName(project), `${CLAUDE_ID}.jsonl`);
  const rollout = join(home, '.codex', 'sessions', rolloutPath(ROOT));
  await mkdir(dirname(claude), { recursive: true });
  await mkdir(dirname(rollout), { recursive: true });
  await writeFile(claude, jsonl(
    { type: 'assistant', sessionId: CLAUDE_ID, cwd: project, message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_01CODEXE2EREADAAAAAAAAAA', name: 'Read', input: { file_path: `${project}/.env` } }] } },
    { type: 'user', sessionId: CLAUDE_ID, cwd: project, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01CODEXE2EREADAAAAAAAAAA', content: 'PORT=3000' }] } },
  ));
  // Codex reads a file of its own, so what each AI did can be told apart in every output.
  const env = `CODEX_TOKEN=${VALUE}\n`;
  await writeFile(rollout, jsonl(
    meta(ROOT, { cwd: project }), turnContext(TURN, { cwd: project }),
    given('user', '<environment_context>local project</environment_context>'),
    given('user', 'Locate SUPABASE_ANON_KEY usage'),
    cell('call_a', 'const r = await tools.exec_command({ cmd: "cat config/.env.codex" }); text(r.output)'),
    item(ROOT, command('exec_a', 'cat config/.env.codex', env)),
    cellOutput('call_a', env),
    said('msg_1', 'final_answer', `The token is ${VALUE}.`),
  ));
  return { project, home, rollout };
}

async function assertNothingLeaks(texts: readonly string[]): Promise<void> {
  for (const text of texts) {
    assert.ok(!text.includes(VALUE), 'the value reaches no output');
    assert.ok(!text.includes(CANARY), 'and nothing a record carried does');
  }
}

test('report reads a Codex rollout as Codex, and refuses a file neither AI wrote', async (t) => {
  const { project, home, rollout } = await world(t);
  const env = { HOME: home };

  const codex = await runCli(['report', '--input', rollout], { cwd: project, env });
  assert.equal(codex.code, 0, codex.stderr);
  assert.match(codex.stdout, /session: 01a0ec9c-…0001 · Codex|session: .* · Codex/);
  assert.match(codex.stdout, /config\/\.env\.codex/);
  assert.match(codex.stdout, /the record does not show all of this: which actions ran/);
  await assertNothingLeaks([codex.stdout, codex.stderr]);

  const byKey = await runCli(['report', '--input', `codex-${ROOT}`], { cwd: project, env });
  assert.match(byKey.stdout, /· Codex/, 'a Codex session is named by its key, as sessions lists it');

  const other = join(project, 'notes.jsonl');
  await writeFile(other, jsonl({ type: CANARY, payload: {} }));
  const neither = await runCli(['report', '--input', other], { cwd: project, env });
  assert.equal(neither.code, 1);
  assert.match(neither.stdout, /neither a Claude Code session nor a Codex session/);
});

test('sessions and start list both AIs in one list, each row naming its AI; check reads Claude Code alone', async (t) => {
  const { project, home } = await world(t);
  const env = { HOME: home };

  const sessions = await runCli(['sessions'], { cwd: project, env });
  assert.match(sessions.stdout, new RegExp(`codex-${ROOT}[\\s\\S]*Codex|Codex[\\s\\S]*codex-${ROOT}`));
  assert.match(sessions.stdout, new RegExp(`${CLAUDE_ID}[^\\n]*\\n?[^\\n]*Claude Code|Claude Code`));

  const out = await realpath(await writeSession(t, {}));
  const start = await runCli(['start', '--no-open', '--no-serve', '--out', out], { cwd: project, env });
  assert.equal(start.code, 0, `start failed: ${start.stdout}${start.stderr}`);
  const files = await readdir(out);
  assert.ok(files.includes(`${CLAUDE_ID}.html`), "Claude Code's report keeps its name");
  assert.ok(files.includes(`codex-${ROOT}.html`), "Codex's is named by its key, so equal ids never overwrite each other");
  const index = await readFile(join(out, 'index.html'), 'utf8');
  assert.match(index, /class="cw-ai"><span class="tag tag-grey tag-badge">Claude Code</);
  assert.match(index, /class="cw-ai"><span class="tag tag-grey tag-badge">Codex</);
  assert.match(index, /Locate SUPABASE_ANON_KEY usage/, 'an exec prompt identifies a conversation with no index title');
  // `2026-10-08-where-it-was-held.md` WH1, WH6: the Codex rollout of this world is a scripted run, and its row says so,
  // read from the rollout's own first line. The Claude Code fixtures carry a canary in `entrypoint`, which reads as
  // unknown, so their rows name the AI alone (WH4, WH4a) - and nothing on the page says VS Code (WHD2).
  assert.match(index, /<span class="tag tag-grey tag-badge">Codex<span class="tag-held"> · <span class="i18n" lang="en">script</);
  assert.match(index, /class="cw-ai"><span class="tag tag-grey tag-badge">Claude Code<\/span>/);
  assert.doesNotMatch(index, /VS Code/);
  const report = await readFile(join(out, `codex-${ROOT}.html`), 'utf8');
  assert.match(report, /class="rp-ai"><span class="tag tag-grey tag-badge">Codex</);
  assert.match(report, /class="rp-ai"><span class="tag tag-grey tag-badge">Codex<span class="tag-held"> · <span class="i18n" lang="en">script</, 'WH8: the report says what the row says');
  assert.match(report, /Locate SUPABASE_ANON_KEY usage/, 'the report carries the same title');
  assert.match(report, /lang="en">What Codex recorded at the time</);
  await assertNothingLeaks(await Promise.all(files.map((file) => readFile(join(out, file), 'utf8'))));

  const check = await runCli(['check'], { cwd: project, env });
  assert.ok(!check.stdout.includes('.env.codex'), 'check is outside the Codex specification, and reads Claude Code alone');
  await assertNothingLeaks([check.stdout]);
});

// Found by looking at the pages: a project only Codex worked in said "No sessions are stored", because the combined list
// took its `found` from Claude Code's store, which that project does not have.
test('a project only Codex worked in is listed, and its report written', async (t) => {
  const { project, home } = await world(t);
  await import('node:fs/promises').then(({ rm }) => rm(join(home, '.claude'), { recursive: true, force: true }));
  const out = await realpath(await writeSession(t, {}));

  const start = await runCli(['start', '--no-open', '--no-serve', '--out', out], { cwd: project, env: { HOME: home } });

  assert.equal(start.code, 0, `start failed: ${start.stdout}${start.stderr}`);
  assert.deepEqual((await readdir(out)).filter((file) => file.startsWith('codex-')), [`codex-${ROOT}.html`]);
  assert.match(await readFile(join(out, 'index.html'), 'utf8'), /class="cw-ai"><span class="tag tag-grey tag-badge">Codex</);
});
