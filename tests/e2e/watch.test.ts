import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { runCli } from '../helpers/cli.ts';
import { RETURN_SESSION_ID, RETURNED_SECRET, returnSessionFiles } from '../helpers/return-session.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

const SEARCHER = 'a4444444444444444';

async function hookInput(t: Parameters<typeof writeSession>[0], carried: 'value' | 'path', agentId = SEARCHER) {
  const root = await writeSession(t, returnSessionFiles({ carried, resultMissing: true }));
  return {
    root,
    input: JSON.stringify({
      session_id: RETURN_SESSION_ID,
      transcript_path: join(root, `${RETURN_SESSION_ID}.jsonl`),
      cwd: '/work/the-app',
      hook_event_name: 'SubagentStop',
      stop_hook_active: false,
      agent_id: agentId,
      agent_type: 'Explore',
      agent_transcript_path: join(root, RETURN_SESSION_ID, 'subagents', `agent-${agentId}.jsonl`),
      last_assistant_message: 'The handler rejects the signature.',
    }),
  };
}

// Spec R2, R5, R8, run the way a hook runs it: input on a pipe, output read as JSON.
test('watch, as a hook: one warning for a value written, naming no value and no path, exit 0', async (t) => {
  const { root, input } = await hookInput(t, 'value');

  const result = await runCli(['watch', '--notify', 'terminal'], { input });

  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout) as Record<string, unknown>;
  // R15: a terminal notice, never a systemMessage, which B4d and B4f showed reaching nobody.
  assert.deepEqual(Object.keys(output), ['terminalSequence']);
  for (const forbidden of [RETURNED_SECRET, '.env', root, SEARCHER]) assert.ok(!result.stdout.includes(forbidden), forbidden);
});

test('watch, as a hook: an agent that only reached files prints nothing by default', async (t) => {
  const { input } = await hookInput(t, 'path');

  assert.deepEqual(await runCli(['watch', '--notify', 'terminal'], { input }), { code: 0, stdout: '', stderr: '' });
});

// D4: exit 2 here would hand stderr to the agent as its next instruction. None of these may.
test('watch, as a hook: bad flags, a broken input and a missing policy all exit 0 with nothing on stderr', async (t) => {
  const { input } = await hookInput(t, 'value');

  for (const [args, text] of [
    // `--notify terminal` throughout: a test run must not put notifications on the machine running it.
    [['watch', '--notify', 'terminal', '--bogus'], input],
    [['watch', '--notify', 'terminal'], '{"hook_event_name": "SubagentStop"'],
    [['watch', '--notify', 'terminal', '--policy', join(await writeSession(t, {}), 'missing.json')], input],
  ] as const) {
    const result = await runCli(args, { input: text });
    assert.equal(result.code, 0, args.join(' '));
    assert.equal(result.stderr, '', args.join(' '));
    assert.match(result.stdout, /^\{"terminalSequence":".*Finished agent not checked: /);
  }
});

/**
 * The two hooks as Claude Code runs them, through the real store: `SubagentStop` finds and keeps, `Stop` says
 * (`specs/2026-09-16-a-notice-in-the-conversation.md` R6). A session id of this run's own, so two test runs at once
 * cannot take each other's alerts.
 */
test('watch, as two hooks: the finding is kept when the agent finishes and said when the turn ends', async (t) => {
  const session = `e2e-chat-${process.pid}`;
  const { root, input } = await hookInput(t, 'value');
  const found = JSON.stringify({ ...(JSON.parse(input) as Record<string, unknown>), session_id: session });

  // Default channels: chat, and nothing that pops up on the machine running the test.
  const finished = await runCli(['watch'], { input: found });
  assert.deepEqual(finished, { code: 0, stdout: '', stderr: '' }, 'this event discards a systemMessage, so it prints nothing');

  const stop = JSON.stringify({ hook_event_name: 'Stop', session_id: session, cwd: '/work/the-app' });
  const said = await runCli(['watch'], { input: stop });

  assert.equal(said.code, 0);
  assert.equal(said.stderr, '');
  const output = JSON.parse(said.stdout) as Record<string, unknown>;
  assert.deepEqual(Object.keys(output), ['systemMessage'], 'the one field B6a measured as shown');
  assert.match(String(output.systemMessage), /^agentwhy · ROTATE: Explore agent wrote a value from a protected file/);
  for (const forbidden of [RETURNED_SECRET, '.env', root, session]) assert.ok(!said.stdout.includes(forbidden), forbidden);

  assert.deepEqual(await runCli(['watch'], { input: stop }), { code: 0, stdout: '', stderr: '' }, 'and a turn says it once');
});

// D14: exit 2 on `Stop` keeps the turn from ending. No shape of input may reach it.
test('watch, as a Stop hook: a broken input and a session with nothing in it exit 0 in silence', async () => {

  for (const text of [
    JSON.stringify({ hook_event_name: 'Stop', session_id: `e2e-empty-${process.pid}`, cwd: '/work/the-app' }),
    JSON.stringify({ hook_event_name: 'Stop' }),
    '{"hook_event_name": "Stop"',
  ]) {
    const result = await runCli(['watch', '--notify', 'chat'], { input: text });
    assert.equal(result.code, 0, text.slice(0, 40));
    assert.equal(result.stderr, '', text.slice(0, 40));
  }
});
