// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runCli } from '../helpers/cli.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

// `2026-11-01-a-key-in-your-message.md` PKD9: `watch` and Codex's `codex-stop`, run on `UserPromptSubmit`, stop a person's
// message holding a key. Values joined at run time (the export's P9).
const STRIPE = ['sk', 'live', 'Q7mZp2Lx9TaV4cBn8RwE3yK'].join('_');
const pasted = `wire this up\n\n<pasted_content id="7">\nimport Stripe from "stripe";\nconst stripe = new Stripe("${STRIPE}");\n</pasted_content id="7">\n`;
// A conversation of its own for every input: a refusal is remembered for its conversation (PK10), in a store the test
// processes share, and the next test's message must not be handed the last one's note.
const prompt = (text: string, cwd: string, rest: Record<string, unknown> = {}) =>
  JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: text, cwd, session_id: `e2e-${Math.random().toString(36).slice(2)}`, ...rest });
const ENGLISH = { LANG: 'en_US.UTF-8', LC_ALL: '', LC_MESSAGES: '' };

test('watch on UserPromptSubmit: a pasted key stops the message, told by the paste\'s line, exit 0, nothing on stderr', async (t) => {
  const root = await writeSession(t, { 'README.md': '# a project\n' });
  const result = await runCli(['watch'], { input: prompt(pasted, root), cwd: root, env: ENGLISH });
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  const answer = JSON.parse(result.stdout) as { decision: string; reason: string };
  assert.equal(answer.decision, 'block');
  assert.match(answer.reason, /^agentwhy blocked this message before your AI read it: it holds a Stripe key \(line 2\)\.\n/);
  assert.match(answer.reason, /Block \.env in agentwhy first/);
  assert.ok(!result.stdout.includes(STRIPE.slice(8)), 'no part of the key');
});

test('watch on UserPromptSubmit: a message with no key, or a sample, goes with nothing written at all (PK6, PKD4, PKD5)', async (t) => {
  const root = await writeSession(t, { 'README.md': '# a project\n' });
  for (const text of ['hello', 'the docs say AKIA' + 'IOSFODNN7EXAMPLE', 'postgres://app:…@db.example.test/main']) {
    const result = await runCli(['watch'], { input: prompt(text, root), cwd: root, env: ENGLISH });
    assert.deepEqual([result.code, result.stdout, result.stderr], [0, '', ''], text);
  }
});

test('where the project blocks .env, the refusal does not ask for it to be blocked (PK4)', async (t) => {
  const root = await writeSession(t, {
    '.claude/settings.local.json': JSON.stringify({
      permissions: { deny: ['Read(**/.env)', 'Edit(**/.env)'] },
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'agentwhy refuse --settings "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"' }] }] },
    }),
  });
  const result = await runCli(['watch'], { input: prompt(pasted, root), cwd: root, env: ENGLISH });
  const reason = (JSON.parse(result.stdout) as { reason: string }).reason;
  assert.match(reason, /^agentwhy blocked this message/);
  assert.ok(!reason.includes('Block .env'));
});

test('Codex\'s Stop hook on UserPromptSubmit stops the message the same way, in the person\'s language', async (t) => {
  const root = await writeSession(t, { 'README.md': '# a project\n' });
  const code = `import Stripe from "stripe";\nconst stripe = new Stripe("${STRIPE}");`;
  const result = await runCli(['codex-stop', '--codex'], { input: prompt(code, root, { turn_id: 't', model: 'm' }), cwd: root, env: { LANG: 'pl_PL.UTF-8', LC_ALL: '', LC_MESSAGES: '' } });
  assert.equal(result.code, 0);
  assert.match((JSON.parse(result.stdout) as { reason: string }).reason, /^agentwhy zablokował tę wiadomość, zanim twoje AI ją przeczytało: zawiera klucz Stripe \(linia 2\)\.\n/);
});

test('PK10: after a refusal, the next message of the same conversation carries the note for the AI, and only once', async (t) => {
  const root = await writeSession(t, { 'README.md': '# a project\n' });
  const session = `e2e-${Math.random().toString(36).slice(2)}`;
  const send = (text: string) => runCli(['watch'], { input: prompt(text, root, { session_id: session }), cwd: root, env: ENGLISH });
  assert.equal((JSON.parse((await send(pasted)).stdout) as { decision: string }).decision, 'block');
  const next = await send('hello');
  assert.equal(next.code, 0);
  assert.match(next.stdout, /^agentwhy, the local tool this user runs, blocked their previous message before you saw it: it held a Stripe key \(line 2\)\./);
  assert.ok(!next.stdout.includes(STRIPE.slice(8)));
  assert.equal((await send('and now?')).stdout, '');
});

test('PK11: in the code editor a refused first message says the keys may have gone to name the chat; in the terminal it does not', async (t) => {
  const root = await writeSession(t, { 'README.md': '# a project\n' });
  const editor = await runCli(['watch'], { input: prompt(pasted, root), cwd: root, env: { ...ENGLISH, CLAUDE_CODE_ENTRYPOINT: 'claude-vscode' } });
  assert.match((JSON.parse(editor.stdout) as { reason: string }).reason, /\nThis app may already have sent the message to name the chat: change these keys as well\.$/);
  const terminal = await runCli(['watch'], { input: prompt(pasted, root), cwd: root, env: { ...ENGLISH, CLAUDE_CODE_ENTRYPOINT: 'cli' } });
  assert.ok(!(JSON.parse(terminal.stdout) as { reason: string }).reason.includes('name the chat'));
});

test('PK7: the computer\'s and the plugin\'s copy check a message in a project whose own watch was set up before messages were', async (t) => {
  const older = JSON.stringify({ hooks: {
    SubagentStop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }],
  } });
  const root = await writeSession(t, { '.claude/settings.local.json': older });
  const run = await runCli(['watch', '--everywhere', '--plugin'], { input: prompt(pasted, root), cwd: root, env: ENGLISH });
  assert.equal((JSON.parse(run.stdout) as { decision: string }).decision, 'block');

  const current = JSON.stringify({ hooks: { ...JSON.parse(older).hooks, UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }] } });
  const own = await writeSession(t, { '.claude/settings.local.json': current });
  const quiet = await runCli(['watch', '--everywhere', '--plugin'], { input: prompt(pasted, own), cwd: own, env: ENGLISH });
  assert.equal(quiet.stdout, '', 'a project whose own watch checks messages is left to it: one refusal, not two');
});

test('review: a UserPromptSubmit input with no usable prompt is answered with nothing, never as an unread Stop', async (t) => {
  const root = await writeSession(t, { 'README.md': '# a project\n' });
  const input = JSON.stringify({ hook_event_name: 'UserPromptSubmit', cwd: root, session_id: `e2e-${Math.random().toString(36).slice(2)}` });
  for (const args of [['watch'], ['watch', '--notify', 'terminal']]) {
    const result = await runCli(args, { input, cwd: root, env: ENGLISH });
    assert.deepEqual([result.code, result.stdout, result.stderr], [0, '', ''], args.join(' '));
  }
});
