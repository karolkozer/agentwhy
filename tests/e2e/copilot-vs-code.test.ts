// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCli } from '../helpers/cli.ts';
import { CANARY, jsonl, writeSession } from '../helpers/synthetic-session.ts';
import { CHAT, chatLog, markdown, terminal, toolPart, tree } from '../helpers/vs-code-chat.ts';

/**
 * `start` writes a report for a session active inside its range, 7 days back from today by default. The chats of
 * `vs-code-chat.ts` are dated 2026-10-13, so from 2026-10-20 the default range left them out and the report this test
 * reads was never written - as `copilot.test.ts` met it a week earlier. A fixed date before the chats holds whatever day
 * the suite runs on.
 */
const SINCE_THE_CHATS = ['--since', '2026-10-01'] as const;

// `.ai/plans/2026-10-13-what-vs-code-copilot-wrote.md` step 3, end to end: a Copilot chat held in VS Code, reported on by
// its log. The value is invented and assembled at run time; it and the canary must reach no output.
const VALUE = ['vscode', 'orchid', '4821', CANARY].join('-');

async function world(t: TestContext): Promise<{ readonly project: string; readonly home: string; readonly log: string }> {
  const project = await realpath(await writeSession(t, { 'package.json': '{}' }));
  const home = await realpath(await writeSession(t, {}));
  const workspace = join(home, 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage', 'a1b2c3');
  await mkdir(join(workspace, 'chatSessions'), { recursive: true });
  await writeFile(join(workspace, 'workspace.json'), JSON.stringify({ folder: `file://${project}` }));
  const log = join(workspace, 'chatSessions', `${CHAT}.jsonl`);
  await writeFile(log, chatLog([{
    prompt: 'Where is the payment token?',
    calls: [
      { id: 'call_READ', name: 'read_file', args: { filePath: `${project}/README.md` }, result: tree(['# shop'], `${project}/README.md`) },
      { id: 'call_CAT', name: 'run_in_terminal', args: { command: 'cat config/.env.copilot', explanation: CANARY, goal: CANARY, mode: 'sync' }, result: `PAYMENT_TOKEN=${VALUE}` },
    ],
    parts: [
      markdown('Looking.'), toolPart('call_READ', 'copilot_readFile', { confirmed: 1 }),
      toolPart('call_CAT', 'run_in_terminal', { confirmed: 4, specific: terminal(project, 0) }), markdown(`The token is ${VALUE}.`),
    ],
  }]) + jsonl({ kind: 1, k: ['customTitle'], v: 'Find the payment token' }));
  return { project, home, log };
}

function assertNothingLeaks(texts: readonly string[]): void {
  for (const text of texts) {
    assert.ok(!text.includes(VALUE), 'the value reaches no output');
    assert.ok(!text.includes(CANARY), 'and nothing a record carried does');
  }
}

test('report reads a VS Code chat log as Copilot, finds what its terminal printed, and says nothing it held', async (t) => {
  const { project, home, log } = await world(t);
  const env = { HOME: home };

  const report = await runCli(['report', '--input', log], { cwd: project, env });
  assert.equal(report.code, 0, report.stderr);
  assert.match(report.stdout, /session: .* · Copilot/);
  assert.match(report.stdout, /config\/\.env\.copilot/);
  assertNothingLeaks([report.stdout, report.stderr]);

  const out = await realpath(await writeSession(t, {}));
  const page = join(out, 'shared.html');
  const shared = await runCli(['report', '--input', log, '--share', '--html', page], { cwd: project, env });
  assert.equal(shared.code, 0, shared.stderr);
  const html = await readFile(page, 'utf8');
  for (const text of [shared.stdout, html]) assert.ok(!text.includes(home) && !text.includes(project), 'nothing above the project is named');
  assertNothingLeaks([shared.stdout, html]);
});

// Plan step 5 gives doctor a VS Code section; until then it says the log is no runtime session, and reads nothing of it.
test("doctor names a VS Code chat log Copilot's and prints nothing of it", async (t) => {
  const { project, home, log } = await world(t);
  const doctor = await runCli(['doctor', '--input', log], { cwd: project, env: { HOME: home } });
  assert.equal(doctor.code, 1, 'a file it could not read as a session needs attention');
  assert.match(doctor.stdout, /^agentwhy doctor · Copilot/);
  assert.match(doctor.stdout, /1 file\(s\) are not Copilot runtime sessions and were not read/);
  assertNothingLeaks([doctor.stdout, doctor.stderr]);
});

// Plan step 4, the maintainer's goal: a Copilot chat held in VS Code is a row of Conversations, as one held in the CLI or the
// desktop app is - its title, where it was held, a report. VS Code's store is measured on macOS alone (VCD5).
test('start and sessions list a Copilot chat held in VS Code as a row, with its title, a code editor, and its report', { skip: process.platform !== 'darwin' }, async (t) => {
  const { project, home } = await world(t);
  const env = { HOME: home };

  const sessions = await runCli(['sessions'], { cwd: project, env });
  assert.equal(sessions.code, 0, sessions.stderr);
  assert.match(sessions.stdout, new RegExp(`copilot-${CHAT} .* Copilot`), 'listed by its key, as a CLI or desktop chat is');

  const out = await realpath(await writeSession(t, {}));
  const start = await runCli(['start', '--no-open', '--no-serve', ...SINCE_THE_CHATS, '--out', out], { cwd: project, env });
  assert.equal(start.code, 0, `start failed: ${start.stdout}${start.stderr}`);
  const written = await readdir(out);
  assert.ok(written.includes(`copilot-${CHAT}.html`), 'its report, named by its key');
  const index = await readFile(join(out, 'index.html'), 'utf8');
  assert.match(index, /<span class="tag tag-grey tag-badge">Copilot<span class="tag-held"> · <span class="i18n" lang="en">code editor</);
  assert.match(index, /Find the payment token/);
  assert.doesNotMatch(index, /<div class="conv-vscode">/, 'a chat that is a row is not said to be missing');
  const page = await readFile(join(out, `copilot-${CHAT}.html`), 'utf8');
  assert.match(page, /config\/\.env\.copilot/);
  assertNothingLeaks(await Promise.all(written.map((file) => readFile(join(out, file), 'utf8'))));
});
