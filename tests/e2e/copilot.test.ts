// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PROJECTS_DIRECTORY, projectDirectoryName } from '../../src/adapter/claude-code/contract/projects.ts';
import { runCli } from '../helpers/cli.ts';
import { meta, ROOT, rolloutPath, said, TURN, turnContext } from '../helpers/codex-session.ts';
import { assistantMessage, editorStart, FORK, records, SESSION, sessionStart, toolResult, toolStart, userMessage, workspaceYaml } from '../helpers/copilot-session.ts';
import { CANARY, jsonl, writeSession } from '../helpers/synthetic-session.ts';

// `.ai/plans/2026-10-09-what-copilot-wrote.md` step 6, end to end: one project with a conversation in Claude Code and one in
// Copilot's desktop app. The value is invented and assembled at run time; it and the canary must reach no output.
const CLAUDE_ID = '7a1d3c55-2e9b-4c71-8f20-5b6d84e1a0c2';
const VALUE = ['copilot', 'orchid', '4821', CANARY].join('-');
const CALL = 'call_COPILOTE2EVIEWAAAAAAAAA';

async function world(t: TestContext): Promise<{ readonly project: string; readonly home: string; readonly events: string }> {
  // Real paths: a child process reports the resolved working directory, which is what every AI records.
  const project = await realpath(await writeSession(t, { 'package.json': '{}' }));
  const home = await realpath(await writeSession(t, {}));
  const claude = join(home, ...PROJECTS_DIRECTORY, projectDirectoryName(project), `${CLAUDE_ID}.jsonl`);
  const folder = join(home, '.copilot', 'session-state', SESSION);
  await mkdir(dirname(claude), { recursive: true });
  await mkdir(folder, { recursive: true });
  await writeFile(claude, jsonl(
    { type: 'assistant', sessionId: CLAUDE_ID, cwd: project, message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_01COPILOTE2EREADAAAAAAAA', name: 'Read', input: { file_path: `${project}/.env` } }] } },
    { type: 'user', sessionId: CLAUDE_ID, cwd: project, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01COPILOTE2EREADAAAAAAAA', content: 'PORT=3000' }] } },
  ));
  // Copilot reads a file of its own, so what each AI did can be told apart in every output.
  const events = join(folder, 'events.jsonl');
  await writeFile(events, records(SESSION,
    sessionStart(SESSION, { context: { cwd: project } }),
    userMessage('Where is the payment token?'),
    assistantMessage('', [{ callId: CALL, name: 'view', arguments: { path: `${project}/config/.env.copilot` } }]),
    toolStart(CALL, 'view', { path: `${project}/config/.env.copilot` }),
    toolResult(CALL, `PAYMENT_TOKEN=${VALUE}`),
    assistantMessage(`The token is ${VALUE}.`),
  ));
  await writeFile(join(folder, 'workspace.yaml'), workspaceYaml({ id: SESSION, cwd: project, name: 'Find the payment token', client: 'github/autopilot' }));
  return { project, home, events };
}

function assertNothingLeaks(texts: readonly string[]): void {
  for (const text of texts) {
    assert.ok(!text.includes(VALUE), 'the value reaches no output');
    assert.ok(!text.includes(CANARY), 'and nothing a record carried does');
  }
}

test('report and doctor read a Copilot session as Copilot, by its file, its folder or its key', async (t) => {
  const { project, home, events } = await world(t);
  const env = { HOME: home };

  const report = await runCli(['report', '--input', events], { cwd: project, env });
  assert.equal(report.code, 0, report.stderr);
  assert.match(report.stdout, /session: .* · Copilot/);
  assert.match(report.stdout, /config\/\.env\.copilot/);
  assertNothingLeaks([report.stdout, report.stderr]);

  const byKey = await runCli(['report', '--input', `copilot-${SESSION}`], { cwd: project, env });
  assert.match(byKey.stdout, /· Copilot/, 'a Copilot session is named by its key, as sessions lists it');

  const doctor = await runCli(['doctor', '--input', dirname(events)], { cwd: project, env });
  assert.equal(doctor.code, 0, doctor.stderr);
  assert.match(doctor.stdout, /^agentwhy doctor · Copilot/);
  assertNothingLeaks([doctor.stdout, doctor.stderr]);
});

test('sessions and start list Copilot beside Claude Code, each row naming its AI and where it was held; check reads Claude Code alone', async (t) => {
  const { project, home } = await world(t);
  const env = { HOME: home };

  const sessions = await runCli(['sessions'], { cwd: project, env });
  assert.match(sessions.stdout, /Copilot/);
  assert.match(sessions.stdout, /Claude Code/);

  const out = await realpath(await writeSession(t, {}));
  const start = await runCli(['start', '--no-open', '--no-serve', '--out', out], { cwd: project, env });
  assert.equal(start.code, 0, `start failed: ${start.stdout}${start.stderr}`);
  const files = await readdir(out);
  assert.ok(files.includes(`${CLAUDE_ID}.html`));
  assert.ok(files.includes(`copilot-${SESSION}.html`), "Copilot's report is named by its key, so equal ids never overwrite each other");
  const index = await readFile(join(out, 'index.html'), 'utf8');
  assert.match(index, /<span class="tag tag-grey tag-badge">Copilot<span class="tag-held"> · <span class="i18n" lang="en">desktop app</);
  assert.match(index, /Find the payment token/, "the title the apps show, from workspace.yaml (CPB35)");
  const page = await readFile(join(out, `copilot-${SESSION}.html`), 'utf8');
  assert.match(page, /class="rp-ai"><span class="tag tag-grey tag-badge">Copilot<span class="tag-held"> · <span class="i18n" lang="en">desktop app</);
  assertNothingLeaks(await Promise.all(files.map((file) => readFile(join(out, file), 'utf8'))));

  const check = await runCli(['check'], { cwd: project, env });
  assert.ok(!check.stdout.includes('.env.copilot'), "check is outside Copilot's specification (CP23), and reads Claude Code alone");
  assertNothingLeaks([check.stdout]);
});

test('a project only Copilot worked in is listed, and its report written', async (t) => {
  const { project, home } = await world(t);
  await rm(join(home, '.claude'), { recursive: true, force: true });
  const out = await realpath(await writeSession(t, {}));

  const start = await runCli(['start', '--no-open', '--no-serve', '--out', out], { cwd: project, env: { HOME: home } });

  assert.equal(start.code, 0, `start failed: ${start.stdout}${start.stderr}`);
  assert.deepEqual((await readdir(out)).filter((file) => file.startsWith('copilot-')), [`copilot-${SESSION}.html`]);
});

// Plan step 7: a project with Claude Code, Codex and Copilot rows - Copilot in the terminal and in the desktop app - each
// row naming its AI and where it was held; a VS Code transcript is no session; a shared report says nothing above the project.
test('three AIs in one project, Copilot in two places; a VS Code transcript read by none; a shared report names nothing above the project', async (t) => {
  const { project, home, events } = await world(t);
  const env = { HOME: home };
  const rollout = join(home, '.codex', 'sessions', rolloutPath(ROOT));
  await mkdir(dirname(rollout), { recursive: true });
  await writeFile(rollout, jsonl(meta(ROOT, { cwd: project }), turnContext(TURN, { cwd: project }), said('msg_1', 'final_answer', 'Done.')));
  const terminal = join(home, '.copilot', 'session-state', FORK);
  await mkdir(terminal, { recursive: true });
  await writeFile(join(terminal, 'events.jsonl'), records(FORK, sessionStart(FORK, { context: { cwd: project } }), userMessage('Tidy the README.'), assistantMessage('Done.')));
  await writeFile(join(terminal, 'workspace.yaml'), workspaceYaml({ id: FORK, cwd: project, name: 'Tidy the README', client: 'github/cli' }));

  const out = await realpath(await writeSession(t, {}));
  const start = await runCli(['start', '--no-open', '--no-serve', '--out', out], { cwd: project, env });
  assert.equal(start.code, 0, `start failed: ${start.stdout}${start.stderr}`);
  const index = await readFile(join(out, 'index.html'), 'utf8');
  assert.match(index, /class="cw-ai"><span class="tag tag-grey tag-badge">Claude Code</);
  assert.match(index, /class="cw-ai"><span class="tag tag-grey tag-badge">Codex</);
  assert.match(index, /<span class="tag tag-grey tag-badge">Copilot<span class="tag-held"> · <span class="i18n" lang="en">terminal</);
  assert.match(index, /<span class="tag tag-grey tag-badge">Copilot<span class="tag-held"> · <span class="i18n" lang="en">desktop app</);

  const transcript = join(project, 'vscode-transcript.jsonl');
  await writeFile(transcript, records(FORK, editorStart(FORK), userMessage()));
  const vscode = await runCli(['report', '--input', transcript], { cwd: project, env });
  assert.equal(vscode.code, 1);
  assert.match(vscode.stdout, /not a Claude Code, Codex or Copilot session/, "VS Code's transcript is no runtime session (CP1a)");

  const shared = join(out, 'shared.html');
  const report = await runCli(['report', '--input', events, '--share', '--html', shared], { cwd: project, env });
  assert.equal(report.code, 0, report.stderr);
  const page = await readFile(shared, 'utf8');
  for (const text of [report.stdout, page]) {
    assert.ok(!text.includes(home) && !text.includes(project), 'nothing above the project is named');
  }
  assertNothingLeaks([report.stdout, page]);
});


// `copilot-blocks-too` CB10: a Copilot conversation's page promises a block only where agentwhy's check in Copilot was read
// as running when the page was written.
test('a Copilot report names Copilot as not covered until agentwhy\'s check runs in it', async (t) => {
  const { project, home, events } = await world(t);
  const env = { HOME: home };
  const page = async (): Promise<string> => {
    const out = join(await writeSession(t, {}), 'report.html');
    const result = await runCli(['report', '--input', events, '--html', out], { cwd: project, env });
    assert.equal(result.code, 0, result.stderr);
    return readFile(out, 'utf8');
  };

  assert.match(await page(), /Copilot isn’t covered yet/, 'no check written');
  await mkdir(join(home, '.copilot', 'hooks'), { recursive: true });
  await writeFile(join(home, '.copilot', 'hooks', 'agentwhy.json'),
    JSON.stringify({ version: 1, hooks: { PreToolUse: [{ type: 'command', command: 'agentwhy refuse --copilot || true', timeoutSec: 30 }] } }));
  // Found by the review of step 4: deny rules with no `refuse` beside them keep nothing from Copilot (CB10, CB16).
  await mkdir(join(project, '.claude'), { recursive: true });
  await writeFile(join(project, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { deny: ['Read(**/.env*)', 'Edit(**/.env*)'] } }));
  assert.match(await page(), /Copilot isn’t covered yet/, 'the check is written, and this project runs no refuse for it to follow');
  await writeFile(join(project, '.claude', 'settings.local.json'), JSON.stringify({
    permissions: { deny: ['Read(**/.env*)', 'Edit(**/.env*)'] },
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'agentwhy refuse' }] }] },
  }));
  assert.doesNotMatch(await page(), /isn’t covered yet|agentwhy covers/, 'the check runs, and follows this project');
});
