// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { CopilotSessionSource } from '../../src/adapter/copilot/events/copilot-session-source.ts';
import { RefuseCliCommand } from '../../src/cli/commands/refuse-cli-command.ts';
import { DEFAULT_POLICY } from '../../src/core/policy/default-policy.ts';
import { Redactor } from '../../src/core/redaction/redactor.ts';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.ts';
import { buildReport } from '../../src/report/build-report.ts';
import { ReportPageRenderer } from '../../src/report/render/report-page/report-page-renderer.ts';
import { runCli } from '../helpers/cli.ts';
import { SESSION, records, sessionStart, toolStart, userMessage } from '../helpers/copilot-session.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

// `2026-10-09-copilot-blocks-too.md` CB1-CB5, CB15, CB18, run the way Copilot runs a hook: its input on a pipe, the exit
// code and both streams read. A refusal is JSON on stdout with exit 0 (CPB44); everything else is exit 0 with nothing.
const input = (tool: string, toolInput: object, cwd: string) =>
  JSON.stringify({ hook_event_name: 'PreToolUse', session_id: SESSION, timestamp: '2026-10-12T09:00:00.000Z', cwd, tool_name: tool, tool_input: toolInput });

/** A project whose Claude Code settings run `refuse` with the built-in list - the marker `--copilot` finds it by (CB16). */
const PROJECT = {
  '.claude/settings.local.json': JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'agentwhy refuse' }] }] } }),
  '.env': 'KEY=not-a-real-value\n',
  'README.md': '# shop\n',
  'src/app.ts': 'export {};\n',
};

const LET_THROUGH = { code: 0, stdout: '', stderr: '' };

/** What a refusal answers: the decision and the reason, at the top for the CLI and the desktop app, and for VS Code beside. */
interface Answer {
  readonly permissionDecision: string;
  readonly permissionDecisionReason: string;
  readonly hookSpecificOutput?: { readonly hookEventName: string; readonly permissionDecision: string; readonly permissionDecisionReason: string };
}

/** What Copilot was answered: the decision, and the reason it records after its own words. */
function answerOf(stdout: string): Answer {
  return JSON.parse(stdout) as Answer;
}

/** A patch as VS Code's `apply_patch` hands it over (§2b g5): its file lines, and changed lines nobody reads. */
const patchOf = (path: string) => ['*** Begin Patch', `*** Update File: ${path}`, '@@', '-old', '+new', '*** End Patch'].join('\n');

test('refuse --copilot: each tool that reaches a blocked file is answered "deny" in JSON, exit 0, with refuse\'s reason', async (t) => {
  const root = await writeSession(t, PROJECT);
  for (const [tool, given, says] of [
    ['Bash', { command: 'cat .env' }, /^agentwhy refused this command: it names \.env, which this project's policy protects \(\*\*\/\.env\*\)\. /],
    ['Read', { path: join(root, '.env') }, /^agentwhy refused this command: it names .+\/\.env, /],
    ['read_file', { filePath: join(root, '.env'), startLine: 1, endLine: 1 }, /^agentwhy refused this command: it names .+\/\.env, /],
    ['Write', { path: '.env', file_text: 'KEY=x' }, /it names \.env, /],
    ['Edit', { path: '.env', old_str: 'a', new_str: 'b' }, /it names \.env, /],
    ['Grep', { pattern: 'KEY', paths: root, output_mode: 'content' }, /^agentwhy refused this command: this search would read .+\/\.env, /],
    // Found by the review of step 1: ripgrep reads a leading `!` as an exclusion, so this searches everything else.
    ['Grep', { pattern: 'KEY', glob: '!*.ts' }, /this search would read \.env, /],
    ['Grep', { pattern: 'KEY', path: root }, /this search would read .+\/\.env, /],
    ['grep_search', { query: 'KEY', isRegexp: false }, /this search would read \.env, /],
    // CB22, CB23: Copilot's agent in VS Code.
    ['run_in_terminal', { command: 'cat .env', explanation: 'Show the file', goal: 'Read it', mode: 'sync' }, /^agentwhy refused this command: it names \.env, /],
    ['apply_patch', { explanation: 'Edit it', input: patchOf(join(root, '.env')) }, /^agentwhy refused this command: it names .+\/\.env, /],
  ] as const) {
    const result = await runCli(['refuse', '--copilot'], { input: input(tool, given, root) });
    assert.equal(result.code, 0, tool);
    assert.equal(result.stderr, '', tool);
    const answer = answerOf(result.stdout);
    assert.deepEqual(Object.keys(answer), ['permissionDecision', 'permissionDecisionReason', 'hookSpecificOutput'], tool);
    assert.equal(answer.permissionDecision, 'deny', tool);
    // CB21: the same decision where VS Code reads it (§2b g4), the CLI refusing on both at once (h1).
    assert.deepEqual(answer.hookSpecificOutput, { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: answer.permissionDecisionReason }, tool);
    assert.match(answer.permissionDecisionReason, says, tool);
    assert.doesNotMatch(answer.permissionDecisionReason, /not-a-real-value/, 'what is inside the file never reaches the agent');
  }
});

test('refuse --copilot: an everyday file, a search its own filter keeps from the file, a listing and another tool run, unsaid', async (t) => {
  const root = await writeSession(t, PROJECT);
  for (const [tool, given] of [
    ['Bash', { command: 'cat README.md' }],
    ['Read', { path: join(root, 'README.md') }],
    ['Edit', { path: 'src/app.ts', old_str: 'a', new_str: 'b' }],
    ['Grep', { pattern: 'export', paths: 'src' }],
    ['Grep', { pattern: 'KEY', glob: '*.ts' }],
    // Found by the review of step 1: the glob models write most was left out, and every such search refused.
    ['Grep', { pattern: 'export', glob: '**/*.ts' }],
    ['grep_search', { query: 'export', includePattern: '**/*.{ts,tsx}' }],
    ['grep_search', { query: 'KEY', includePattern: '*.md' }],
    ['Glob', { pattern: '**/.env*' }],
    ['file_search', { query: '.env' }],
    ['search_code_subagent', { query: 'Where is the key in .env?' }],
    ['github-mcp-server-get_file_contents', { path: '.env' }],
    ['run_in_terminal', { command: 'cat README.md', explanation: 'x', goal: 'y', mode: 'sync' }],
    ['apply_patch', { explanation: 'x', input: patchOf(join(root, 'src', 'app.ts')) }],
    ['apply_patch', { explanation: 'x', input: 'no file lines in it' }],
    ['manage_todo_list', { todoList: [{ title: 'Read .env' }] }],
  ] as const) {
    assert.deepEqual(await runCli(['refuse', '--copilot'], { input: input(tool, given, root) }), LET_THROUGH, `${tool} ${JSON.stringify(given)}`);
  }
});

// CB16, as `--codex` (AO6): the project is the nearest folder above whose Claude Code settings run refuse; with none,
// no rule anybody chose applies here.
test('refuse --copilot: the project is found above the folder it runs in, and with none the call runs', async (t) => {
  const root = await writeSession(t, PROJECT);
  const refused = await runCli(['refuse', '--copilot'], { input: input('Bash', { command: 'cat ../.env' }, join(root, 'src')) });
  assert.equal(answerOf(refused.stdout).permissionDecision, 'deny');

  const plain = await writeSession(t, { '.env': 'KEY=x\n' });
  assert.deepEqual(await runCli(['refuse', '--copilot'], { input: input('Bash', { command: 'cat .env' }, plain) }), LET_THROUGH);
});

// CB18, CB8: Copilot refuses every call a hook fails on (§2a c4, c5), and may read any text as an answer - so a check
// that could not run lets the call run, and nothing is written where R20 writes its notice.
test('refuse --copilot: an input, a flag or a policy it cannot read lets the call run, with nothing written', async (t) => {
  const root = await writeSession(t, PROJECT);
  const missing = join(root, 'missing.json');
  const cat = input('Bash', { command: 'cat .env' }, root);
  for (const [args, given] of [
    [['refuse', '--copilot'], '{"hook_event_name": "PreToolUse"'],
    [['refuse', '--copilot'], ''],
    [['refuse', '--copilot'], input('Read', {}, root)],
    [['refuse', '--copilot', '--bogus'], cat],
    [['refuse', '--copilot', '--codex'], cat],
    [['refuse', '--copilot', '--everywhere'], cat],
    [['refuse', '--copilot', '--policy', missing], cat],
    [['refuse', '--copilot', '--settings', '.claude/missing.json'], input('Bash', { command: 'cat .env' }, join(root, 'nowhere'))],
  ] as const) {
    assert.deepEqual(await runCli(args, { input: given }), LET_THROUGH, `${args.join(' ')} ${given}`);
  }
});

test('refuse --copilot: a crash lets the call run; without the flag a crash is what it was', async () => {
  const crashing = () => new RefuseCliCommand({ refusal: { decide: () => Promise.reject(new Error('boom')) }, interactive: false });
  assert.deepEqual(await crashing().execute(['--copilot']), { kind: 'completed', output: '', exitCode: 0 });
  await assert.rejects(crashing().execute([]), /boom/);
  await assert.rejects(crashing().execute(['--codex']), /boom/);
});

// CPD12: Copilot records a JSON reason after its own words (CPB44), and refuse's own sentence is what makes a hook's
// refusal agentwhy's - so the report says a rule stopped it, never "a check".
test('refuse --copilot: the reason it answers is read back from the record as a rule\'s refusal', async (t) => {
  const root = await writeSession(t, PROJECT);
  const { permissionDecisionReason } = answerOf((await runCli(['refuse', '--copilot'], { input: input('Bash', { command: 'cat .env' }, root) })).stdout);

  const store = await writeSession(t, {
    [`${SESSION}/events.jsonl`]: records(SESSION,
      sessionStart(SESSION, { context: { cwd: root } }),
      userMessage('What is in .env?'),
      toolStart('call_A', 'bash', { command: 'cat .env' }),
      { type: 'tool.execution_complete', data: { toolCallId: 'call_A', success: false, error: { code: 'denied', message: `Denied by preToolUse hook: ${permissionDecisionReason}` } } }),
  });
  const files = new NodeFileSystem();
  const model = await new CopilotSessionSource({ directories: files, files }).read(join(store, SESSION));
  const call = model.events.find((event) => event.id === 'call_A');
  assert.equal(call?.outcome, 'blocked');
  assert.equal(call?.result?.refusedBy, 'rule');

  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, false), { share: false, projectRoot: model.projectRoot });
  assert.match(new ReportPageRenderer().render({ report, withIndexLink: false }), /A rule in your settings stopped it\./);
});
