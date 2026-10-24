// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../helpers/cli.ts';
import { RETURN_SESSION_ID, returnSessionFiles } from '../helpers/return-session.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

/** The computer's own entries, as `agentwhy protect --refuse` and the computer's Alerts write them. */
const COMPUTER_REFUSE = (matcher: string) => ({ matcher, hooks: [{ type: 'command', command: 'npx @agentwhy/cli@1 refuse --everywhere' }] });
const COMPUTER_WATCH = { hooks: [{ type: 'command', command: 'npx @agentwhy/cli@1 watch --everywhere' }] };
/** A rule of the computer's own (G4), so that the computer's check has something to refuse in a folder of no project. */
const COMPUTER_RULE = { permissions: { deny: ['Read(**/.env)', 'Edit(**/.env)'] } };

/** A home of its own for one test, with the person's `~/.claude/settings.json` as given. */
async function home(t: TestContext, settings: unknown): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'agentwhy-plugin-home-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await mkdir(join(folder, '.claude'), { recursive: true });
  await writeFile(join(folder, '.claude', 'settings.json'), typeof settings === 'string' ? settings : JSON.stringify(settings));
  return folder;
}

const shell = (command: string) =>
  JSON.stringify({ session_id: 's', cwd: '/work/the-app', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });

// AP5. Claude Code runs a plugin's hook beside the same hook in a settings file, both at once (§2.5, measured §8.2).
test('refuse --everywhere --plugin: the person\'s own check on the shell and Read decides, and the plugin\'s lets the call through', async (t) => {
  const HOME = await home(t, { ...COMPUTER_RULE, hooks: { PreToolUse: [COMPUTER_REFUSE('Bash|Read')] } });

  assert.deepEqual(await runCli(['refuse', '--everywhere', '--plugin'], { input: shell('cat .env'), env: { HOME } }), { code: 0, stdout: '', stderr: '' });
  // The person's own copy, the same command without `--plugin`, still refuses: the call is not left unchecked.
  assert.equal((await runCli(['refuse', '--everywhere'], { input: shell('cat .env'), env: { HOME } })).code, 2);
});

test('refuse --everywhere --plugin: with no check of the person\'s, or one on the shell alone, the plugin\'s refuses', async (t) => {
  for (const settings of [COMPUTER_RULE, { ...COMPUTER_RULE, hooks: { PreToolUse: [COMPUTER_REFUSE('Bash')] } }]) {
    const HOME = await home(t, settings);

    const result = await runCli(['refuse', '--everywhere', '--plugin'], { input: shell('cat .env'), env: { HOME } });

    assert.equal(result.code, 2, JSON.stringify(settings));
    assert.match(result.stderr, /^agentwhy refused this command: it names \.env,/);
  }
});

// Review of 2026-10-24: an entry of the person's on `Read` alone checks no shell command, so the plugin's copy must.
test('refuse --everywhere --plugin: a computer check of the person\'s on Read alone leaves the shell to the plugin\'s', async (t) => {
  const HOME = await home(t, { ...COMPUTER_RULE, hooks: { PreToolUse: [COMPUTER_REFUSE('Read')] } });

  const result = await runCli(['refuse', '--everywhere', '--plugin'], { input: shell('cat .env'), env: { HOME } });

  assert.equal(result.code, 2, result.stderr);
  assert.match(result.stderr, /^agentwhy refused this command: it names \.env,/);
});

test('refuse --plugin without --everywhere is an argument it does not recognise: said, and the command runs (R20)', async () => {
  for (const args of [['--plugin'], ['--codex', '--plugin']]) {
    const result = await runCli(['refuse', ...args], { input: shell('cat .env') });

    assert.equal(result.code, 0, args.join(' '));
    assert.notEqual(result.stdout, '', args.join(' '));
  }
});

const SEARCHER = 'a4444444444444444';

/**
 * A helper that carried a value back, and the turn it ended in, as `watch.test.ts` runs them: `SubagentStop` keeps the
 * finding and `Stop` says it (R6). One session id per call, so no two runs share what the store keeps.
 */
async function turn(t: TestContext, name: string): Promise<{ readonly finished: string; readonly stop: string }> {
  const root = await writeSession(t, returnSessionFiles({ carried: 'value', resultMissing: true }));
  const session = `e2e-plugin-${name}-${process.pid}`;
  return {
    finished: JSON.stringify({
      session_id: session,
      transcript_path: join(root, `${RETURN_SESSION_ID}.jsonl`),
      cwd: '/work/the-app',
      hook_event_name: 'SubagentStop',
      stop_hook_active: false,
      agent_id: SEARCHER,
      agent_type: 'Explore',
      agent_transcript_path: join(root, RETURN_SESSION_ID, 'subagents', `agent-${SEARCHER}.jsonl`),
      last_assistant_message: 'The handler rejects the signature.',
    }),
    stop: JSON.stringify({ hook_event_name: 'Stop', session_id: session, cwd: '/work/the-app' }),
  };
}

/** Both hooks of one turn, run with these arguments and this home: what the `Stop` hook printed. */
async function said(args: readonly string[], inputs: { readonly finished: string; readonly stop: string }, HOME: string): Promise<string> {
  const kept = await runCli(['watch', ...args], { input: inputs.finished, env: { HOME } });
  assert.deepEqual(kept, { code: 0, stdout: '', stderr: '' });
  const stopped = await runCli(['watch', ...args], { input: inputs.stop, env: { HOME } });
  assert.equal(stopped.code, 0);
  assert.equal(stopped.stderr, '');
  return stopped.stdout;
}

test('watch --everywhere --plugin: quiet where the person\'s own settings run the computer\'s watch on both events', async (t) => {
  const watching = await home(t, { hooks: { SubagentStop: [COMPUTER_WATCH], Stop: [COMPUTER_WATCH] } });
  const onStopAlone = await home(t, { hooks: { Stop: [COMPUTER_WATCH] } });
  const notWatching = await home(t, {});

  const stepsAside = await said(['--everywhere', '--plugin'], await turn(t, 'aside'), watching);
  const speaks = await said(['--everywhere', '--plugin'], await turn(t, 'speaks'), notWatching);
  const halfInstalled = await said(['--everywhere', '--plugin'], await turn(t, 'half'), onStopAlone);
  const ownCopy = await said(['--everywhere'], await turn(t, 'own'), watching);

  assert.equal(stepsAside, '');
  assert.match(speaks, /^\{"systemMessage":"agentwhy · ROTATE: /, 'with no watch of the person\'s, the plugin\'s copy is the one that speaks');
  assert.equal(halfInstalled, speaks, 'a computer watch on one event alone is not counted on (GD23), so the plugin\'s speaks');
  // APO7: the plugin's copy names the report as the plugin opens it - a person with the plugin alone may have no command.
  assert.match(speaks, /Details: \/agentwhy:report/);
  assert.doesNotMatch(speaks, /agentwhy report --open/);
  assert.equal(ownCopy.replace('agentwhy report --open', '/agentwhy:report'), speaks,
    'the person\'s own copy says what the plugin\'s would have, naming its own command: the turn is said once');
});

test('watch --everywhere --plugin: a settings file that cannot be read runs nothing anybody knows of, so the plugin speaks', async (t) => {
  const broken = await home(t, '{ not json');

  assert.match(await said(['--everywhere', '--plugin'], await turn(t, 'broken'), broken), /^\{"systemMessage":"agentwhy · ROTATE: /);
});

test('watch --plugin without --everywhere is an argument it does not recognise: said, exit 0 (R8)', async (t) => {
  const { stop } = await turn(t, 'unknown');

  const result = await runCli(['watch', '--plugin', '--notify', 'terminal'], { input: stop });

  assert.equal(result.code, 0);
  assert.notEqual(result.stdout, '');
  // APO7: the plugin's hook - it names --plugin - says it in the plugin's words.
  assert.match(result.stdout, /\/agentwhy:report/);
  assert.doesNotMatch(result.stdout, /agentwhy report --open/);
});

// AP6: the plugin's SessionStart hook, as Claude Code runs it - its plain output is what the agent is given.
test('session-start: a new session in a project with no setup is told once, then not again that week', async (t) => {
  const HOME = await home(t, {});
  const project = join(HOME, 'Projects', 'sunny-bakery');
  await mkdir(project, { recursive: true });
  const input = JSON.stringify({ session_id: 's', hook_event_name: 'SessionStart', source: 'startup', cwd: project });

  const first = await runCli(['session-start'], { input, env: { HOME }, cwd: project });
  const second = await runCli(['session-start'], { input, env: { HOME }, cwd: project });

  assert.equal(first.code, 0);
  assert.match(first.stdout, /^agentwhy, a tool the person installed as a Claude Code plugin, is active in this session\. .*\/agentwhy:report\.\n$/s);
  assert.equal(first.stderr, '');
  assert.deepEqual(second, { code: 0, stdout: '', stderr: '' });
  const record = await readFile(join(HOME, '.agentwhy', 'plugin-said.jsonl'), 'utf8');
  assert.equal(record.trim().split('\n').length, 1);
  assert.ok(!record.includes(HOME), 'the project by the name the record keeps it under, never its path');
});

test('session-start: a project set up, a session resumed, and an input it cannot read say nothing, exit 0', async (t) => {
  const HOME = await home(t, {});
  const project = join(HOME, 'Projects', 'set-up');
  await mkdir(join(project, '.claude'), { recursive: true });
  await writeFile(join(project, '.claude', 'settings.local.json'), JSON.stringify({ hooks: { SubagentStop: [COMPUTER_WATCH], Stop: [COMPUTER_WATCH] } }));
  for (const input of [
    JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: project }),
    JSON.stringify({ hook_event_name: 'SessionStart', source: 'resume', cwd: join(HOME, 'Projects', 'other') }),
    'not json',
  ]) {
    assert.deepEqual(await runCli(['session-start'], { input, env: { HOME } }), { code: 0, stdout: '', stderr: '' }, input);
  }
});
