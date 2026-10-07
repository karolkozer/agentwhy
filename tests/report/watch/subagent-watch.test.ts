// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { ClaudeCodeSessionDiscovery } from '../../../src/adapter/claude-code/discovery/claude-code-session-discovery.ts';
import { ClaudeCodeSessionSource } from '../../../src/adapter/claude-code/events/claude-code-session-source.ts';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import { NodeFileSystem } from '../../../src/infrastructure/node-file-system.ts';
import { NoticeWordsRenderer } from '../../../src/report/watch/render/notice-words.ts';
import type { AlertStore, RememberedAlert } from '../../../src/ports/alert-store.ts';
import { SubagentWatch, type WatchOptions, type WatchResult } from '../../../src/report/watch/subagent-watch.ts';
import { RETURN_SESSION_ID, RETURNED_SECRET, returnSessionFiles, type ReturnSessionOptions } from '../../helpers/return-session.ts';
import { writeSession } from '../../helpers/synthetic-session.ts';

const SEARCHER = 'a4444444444444444';
const MIDDLE = 'a5555555555555555';
const files = new NodeFileSystem();

/** The store as the two hooks see it, without a disk: what one run leaves, the next run takes. */
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

/** The moment a `SubagentStop` hook runs: the agent has finished, and nothing has come back to the session yet. */
const AT_THE_HOOK: Partial<ReturnSessionOptions> = { resultMissing: true };

/**
 * The agent's last line, taken off disk and returned as its words - what B4c measured on 4 of 4 agents: the final text
 * block is written after the hook has run.
 */
function withoutLastWords(files: Record<string, string>, agentId: string): { files: Record<string, string>; words: string } {
  const key = `${RETURN_SESSION_ID}/subagents/agent-${agentId}.jsonl`;
  const lines = (files[key] ?? '').split('\n').filter((line) => line.length > 0);
  const last = JSON.parse(lines.at(-1) ?? '{}') as { message?: { content?: { type: string; text?: string }[] } };
  const words = last.message?.content?.find((block) => block.type === 'text')?.text ?? '';
  return { files: { ...files, [key]: `${lines.slice(0, -1).join('\n')}\n` }, words };
}

async function watchOn(
  t: Parameters<typeof writeSession>[0],
  session: ReturnSessionOptions,
  agentId: string,
  options: Partial<WatchOptions> = {},
  input?: (transcript: string, words: string) => string,
  lastWordsOnDisk = true,
  store: AlertStore = memoryStore(),
): Promise<WatchResult & { root: string; notified: string[]; store: AlertStore }> {
  const notified: string[] = [];
  const all = returnSessionFiles({ ...AT_THE_HOOK, ...session });
  const { files: onDisk, words } = lastWordsOnDisk ? { files: all, words: '' } : withoutLastWords(all, agentId);
  const root = await writeSession(t, onDisk);
  const transcript = join(root, `${RETURN_SESSION_ID}.jsonl`);
  const text =
    input?.(transcript, words) ??
    JSON.stringify({ hook_event_name: 'SubagentStop', transcript_path: transcript, agent_id: agentId, cwd: '/work/the-app' });
  const watch = new SubagentWatch({
    source: new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files }),
    files,
    input: { readAll: async () => text },
    createRedactor: (projectRoot) => new Redactor('test', projectRoot, false),
    renderer: new NoticeWordsRenderer(),
    notifier: { notify: async (title, words) => (notified.push(`${title}: ${words}`), true) },
    home: '/Users/someone',
    preferencesPath: '/Users/someone/.config/agentwhy/notices.json',
    store,
    invocation: { find: async () => 'agentwhy', version: async () => undefined },
  });
  return { ...(await watch.run({ on: 'value', channels: ['terminal', 'os'], ...options })), root, notified, store };
}

const levelOf = (result: WatchResult): string =>
  result.notice.kind === 'alert'
    ? result.notice.alert.level
    : result.notice.kind === 'not-checked'
      ? result.notice.reason
      : result.notice.kind === 'no-record' ? 'no-record' : 'quiet';

// R2: the motivating case, at the moment its agent finished.
test('an agent that wrote a value from a protected file alerts, before anything came back', async (t) => {
  const result = await watchOn(t, { carried: 'value' }, SEARCHER);

  assert.equal(levelOf(result), 'value');
  // R15: the same words on both channels - the system notification, and the terminal notice the hook prints.
  assert.equal(result.notified.length, 1);
  assert.match(result.notified[0] ?? '', /^agentwhy: ROTATE: Explore agent wrote a value from a protected file; its answer may carry it\./);
  assert.match(result.notified[0] ?? '', / 2 files reached\. Details: agentwhy report --open$/);
  const { terminalSequence } = JSON.parse(result.output) as { terminalSequence: string };
  assert.ok(terminalSequence.includes('Explore agent wrote a value from a protected file'));
});

// R2: a value an agent below it read, in the words of the agent that started it.
test('an agent whose messages carry a value an agent below it read alerts too', async (t) => {
  const result = await watchOn(t, { carried: 'value', nested: true }, MIDDLE);

  assert.equal(levelOf(result), 'value');
});

test('a prefix and a suffix of the value are a value too', async (t) => {
  assert.equal(levelOf(await watchOn(t, { carried: 'fragment' }, SEARCHER)), 'value');
});

// R2: `reached` is quiet unless asked for, and says no value was found when it is.
test('an agent that reached protected files and wrote no value is quiet by default', async (t) => {
  const quiet = await watchOn(t, { carried: 'path' }, SEARCHER);
  assert.deepEqual([quiet.notice, quiet.output, quiet.notified], [{ kind: 'quiet' }, '', []]);

  const asked = await watchOn(t, { carried: 'path' }, SEARCHER, { on: 'reached' });
  assert.equal(levelOf(asked), 'reached');
  assert.match(asked.output, /CHECK: Explore agent reached 2 protected files; no value found in its messages\./);
});

// R9, measured by B4c: the words carrying the value are not on disk when the hook runs.
test('a value in last words the transcript does not hold yet is read from the hook input', async (t) => {
  const hook = (withWords: boolean) => (transcript: string, words: string) =>
    JSON.stringify({
      hook_event_name: 'SubagentStop',
      transcript_path: transcript,
      agent_id: SEARCHER,
      ...(withWords ? { last_assistant_message: words } : {}),
    });

  const fromDiskAlone = await watchOn(t, { carried: 'value' }, SEARCHER, { on: 'reached' }, hook(false), false);
  assert.equal(levelOf(fromDiskAlone), 'reached', 'the file alone misses the value - the reason R9 exists');

  const withHookInput = await watchOn(t, { carried: 'value' }, SEARCHER, {}, hook(true), false);
  assert.equal(levelOf(withHookInput), 'value');
  assert.ok(!withHookInput.output.includes(RETURNED_SECRET));
});

// R4.
test('an agent the session does not hold is said to be unchecked', async (t) => {
  assert.equal(levelOf(await watchOn(t, { carried: 'value' }, 'a0000000000000000')), 'agent-not-found');
  // The session's own agent has no SubagentStop, so an input naming it is not an agent this can speak about.
  assert.equal(levelOf(await watchOn(t, { carried: 'value' }, RETURN_SESSION_ID)), 'agent-not-found');
});

/**
 * B4g: what the Claude desktop app hands the hook after a turn - an agent with an empty type, whose own file the input
 * names and nobody wrote, and whose id is nowhere in the session.
 */
const NO_RECORD_AGENT = 'a0000000000000000';
const noRecord = (sessionId?: string) => (transcript: string): string =>
  JSON.stringify({
    hook_event_name: 'SubagentStop',
    transcript_path: transcript,
    agent_id: NO_RECORD_AGENT,
    agent_type: '',
    agent_transcript_path: join(dirname(transcript), RETURN_SESSION_ID, 'subagents', `agent-${NO_RECORD_AGENT}.jsonl`),
    ...(sessionId === undefined ? {} : { session_id: sessionId }),
    cwd: '/work/the-app',
  });
const NO_RECORD_WORDS = "A helper finished without leaving a record, so I can't check what it did. I say this once per chat.";

// R4a: not found, and nothing on disk that could ever be read - said as what it is, with no report to send anyone to.
test('an agent whose own file was never written is said to have left no record', async (t) => {
  const result = await watchOn(t, { carried: 'value' }, SEARCHER, {}, noRecord());

  assert.equal(levelOf(result), 'no-record');
  assert.deepEqual(result.notified, [`agentwhy: ${NO_RECORD_WORDS}`]);
});

// R4: a file that is there is a record, so an agent missing from the session with one is still an agent not found.
test('an agent whose own file is there but whose id the session does not hold is still not found', async (t) => {
  const result = await watchOn(t, { carried: 'value' }, SEARCHER, {}, (transcript) =>
    JSON.stringify({
      hook_event_name: 'SubagentStop',
      transcript_path: transcript,
      agent_id: NO_RECORD_AGENT,
      agent_transcript_path: join(dirname(transcript), RETURN_SESSION_ID, 'subagents', `agent-${SEARCHER}.jsonl`),
      cwd: '/work/the-app',
    }));

  assert.equal(levelOf(result), 'agent-not-found');
});

// R4a, on B4g's timing: the desktop app's agent finishes about 3 seconds after the turn's Stop, so a later one arrives
// after the store was taken - and must still find that it was said.
test('an agent that kept no record is said once a chat, on every channel, and not again after the turn ends', async (t) => {
  const store = memoryStore();
  const channels = { channels: ['chat', 'os'] } as const;
  const first = await watchOn(t, { carried: 'value' }, SEARCHER, channels, noRecord(RETURN_SESSION_ID), true, store);
  const again = await watchOn(t, { carried: 'value' }, SEARCHER, channels, noRecord(RETURN_SESSION_ID), true, store);

  assert.deepEqual(first.notified, [`agentwhy: ${NO_RECORD_WORDS}`]);
  assert.deepEqual([again.notice, again.output, again.notified], [{ kind: 'quiet' }, '', []]);

  const said = await watchOn(t, { carried: 'value' }, SEARCHER, channels, () => stopInput(), true, store);
  const { systemMessage } = JSON.parse(said.output) as { systemMessage: string };
  assert.equal(systemMessage, `agentwhy · ${NO_RECORD_WORDS}`);

  const later = await watchOn(t, { carried: 'value' }, SEARCHER, channels, noRecord(RETURN_SESSION_ID), true, store);
  assert.deepEqual([later.notice, later.notified], [{ kind: 'quiet' }, []]);
  const quietTurn = await watchOn(t, { carried: 'value' }, SEARCHER, channels, () => stopInput(), true, store);
  assert.equal(quietTurn.output.includes(NO_RECORD_WORDS), false, 'said once, and the next turn does not repeat it');
});

// Without a session there is nothing to count "once" in, and saying it each time is better than never.
test('an agent that kept no record in a session the input does not name is said every time', async (t) => {
  const store = memoryStore();
  const first = await watchOn(t, { carried: 'value' }, SEARCHER, {}, noRecord(), true, store);
  const again = await watchOn(t, { carried: 'value' }, SEARCHER, {}, noRecord(), true, store);

  assert.deepEqual([levelOf(first), levelOf(again)], ['no-record', 'no-record']);
});

// R8: every way of not looking is a notice.
test('an unusable input, a missing session and a refused policy each say they were not checked', async (t) => {
  assert.equal(levelOf(await watchOn(t, { carried: 'value' }, SEARCHER, {}, () => 'not json')), 'input');
  assert.equal(
    levelOf(
      await watchOn(t, { carried: 'value' }, SEARCHER, {}, (transcript) =>
        JSON.stringify({ hook_event_name: 'SubagentStop', transcript_path: `${transcript}.gone`, agent_id: SEARCHER }),
      ),
    ),
    'session',
  );
  assert.equal(levelOf(await watchOn(t, { carried: 'value' }, SEARCHER, { policyPath: '/nowhere/policy.json' })), 'policy');
});

// R5: whatever the level, no value, no path, no id and no task text reaches what the hook prints.
test('no output names the value, a path, an agent id or what the agent was asked', async (t) => {
  const outputs = [
    await watchOn(t, { carried: 'value' }, SEARCHER),
    await watchOn(t, { carried: 'value', nested: true }, MIDDLE, { on: 'reached' }),
    await watchOn(t, { carried: 'path' }, SEARCHER, { on: 'reached' }),
    await watchOn(t, { carried: 'value' }, 'a0000000000000000'),
    await watchOn(t, { carried: 'value' }, SEARCHER, {}, noRecord(RETURN_SESSION_ID)),
  ];

  for (const { output, root, notified } of outputs) {
    assert.ok(output.length > 0);
    for (const forbidden of [RETURNED_SECRET, RETURNED_SECRET.slice(0, 6), '.env', 'apps/', root, SEARCHER, MIDDLE, RETURN_SESSION_ID, 'webhook', 'toolu_']) {
      assert.ok(!output.includes(forbidden), `the output names ${forbidden}: ${output}`);
      assert.ok(!notified.join('\n').includes(forbidden), `the notification names ${forbidden}`);
    }
  }
});

// R15: a channel not asked for is not used.
test('only the channels asked for are used', async (t) => {
  const osOnly = await watchOn(t, { carried: 'value' }, SEARCHER, { channels: ['os'] });
  assert.deepEqual([osOnly.output, osOnly.notified.length], ['', 1]);

  const terminalOnly = await watchOn(t, { carried: 'value' }, SEARCHER, { channels: ['terminal'] });
  assert.deepEqual([terminalOnly.output.startsWith('{"terminalSequence":'), terminalOnly.notified], [true, []]);
});

/** A `Stop` input: the event, and the session whose turn has ended. */
const stopInput = (sessionId = RETURN_SESSION_ID): string => JSON.stringify({ hook_event_name: 'Stop', session_id: sessionId, cwd: '/work/the-app' });

// `a-notice-in-the-conversation` R6: SubagentStop finds it, and prints nothing, because this event discards a
// systemMessage (B4d, B4f). The words wait for the end of the turn.
test('on the chat channel a finished agent leaves its words for the end of the turn', async (t) => {
  const found = await watchOn(t, { carried: 'value' }, SEARCHER, { channels: ['chat'] }, (transcript) =>
    JSON.stringify({ hook_event_name: 'SubagentStop', transcript_path: transcript, agent_id: SEARCHER, session_id: RETURN_SESSION_ID, cwd: '/work/the-app' }));

  assert.deepEqual([found.output, found.notified], ['', []], 'nothing is printed and nothing pops up');
  assert.deepEqual(await found.store.take(RETURN_SESSION_ID), [{
    agentId: SEARCHER,
    level: 'value',
    words: 'ROTATE: Explore agent wrote a value from a protected file; its answer may carry it. 2 files reached. Details: agentwhy report --open',
  }]);
});

// R8, on the measured reason for it: SubagentStop fired three times for one finished agent (B5h).
test('three hook runs for one finished agent leave one line to say', async (t) => {
  const store = memoryStore();
  const subagentStop = (transcript: string): string =>
    JSON.stringify({ hook_event_name: 'SubagentStop', transcript_path: transcript, agent_id: SEARCHER, session_id: RETURN_SESSION_ID, cwd: '/work/the-app' });
  for (let run = 0; run < 3; run++) {
    await watchOn(t, { carried: 'value' }, SEARCHER, { channels: ['chat'] }, subagentStop, true, store);
  }

  const said = await watchOn(t, { carried: 'value' }, SEARCHER, { channels: ['chat'] }, () => stopInput(), true, store);

  const { systemMessage } = JSON.parse(said.output) as { systemMessage: string };
  assert.equal((systemMessage.match(/Explore agent wrote a value/g) ?? []).length, 1);
});

test('at the end of the turn the notice is said once, and then there is nothing left to say', async (t) => {
  const store = memoryStore();
  await watchOn(t, { carried: 'value' }, SEARCHER, { channels: ['chat'] }, (transcript) =>
    JSON.stringify({ hook_event_name: 'SubagentStop', transcript_path: transcript, agent_id: SEARCHER, session_id: RETURN_SESSION_ID, cwd: '/work/the-app' }), true, store);

  const said = await watchOn(t, { carried: 'value' }, SEARCHER, { channels: ['chat'] }, () => stopInput(), true, store);
  const again = await watchOn(t, { carried: 'value' }, SEARCHER, { channels: ['chat'] }, () => stopInput(), true, store);

  assert.match(said.output, /^\{"systemMessage":"agentwhy · ROTATE: Explore agent wrote a value from a protected file/);
  assert.ok(!said.output.includes(RETURNED_SECRET) && !said.output.includes('.env'), 'no value and no path, as on every channel');
  assert.deepEqual([again.notice, again.output], [{ kind: 'quiet' }, ''], 'a turn says it once');
});

test('a turn that remembered nothing says nothing at all', async (t) => {
  const said = await watchOn(t, { carried: 'value' }, SEARCHER, { channels: ['chat'] }, () => stopInput('never-seen'));

  assert.deepEqual([said.notice, said.output, said.notified], [{ kind: 'quiet' }, '', []]);
});

// R12: a line that listed them would be cut before the reader reached the end, so they are counted.
test('several agents in one turn are counted, not listed', async (t) => {
  const store = memoryStore();
  for (const agentId of [SEARCHER, MIDDLE]) {
    await watchOn(t, { carried: 'value', nested: true }, agentId, { channels: ['chat'] }, (transcript) =>
      JSON.stringify({ hook_event_name: 'SubagentStop', transcript_path: transcript, agent_id: agentId, session_id: RETURN_SESSION_ID, cwd: '/work/the-app' }), true, store);
  }

  const said = await watchOn(t, { carried: 'value', nested: true }, SEARCHER, { channels: ['chat'] }, () => stopInput(), true, store);

  const { systemMessage } = JSON.parse(said.output) as { systemMessage: string };
  assert.equal(systemMessage, 'agentwhy · ROTATE: 2 agents wrote a value from a protected file; their answers may carry it. Details: agentwhy report --open');
});

// Taking clears the store, so a run with no channel to show the words must leave them where they are.
test('without the chat channel, the end of the turn says nothing and keeps what was remembered', async (t) => {
  const store = memoryStore();
  await watchOn(t, { carried: 'value' }, SEARCHER, { channels: ['chat'] }, (transcript) =>
    JSON.stringify({ hook_event_name: 'SubagentStop', transcript_path: transcript, agent_id: SEARCHER, session_id: RETURN_SESSION_ID, cwd: '/work/the-app' }), true, store);

  const said = await watchOn(t, { carried: 'value' }, SEARCHER, { channels: ['terminal'] }, () => stopInput(), true, store);

  assert.deepEqual([said.notice, said.output], [{ kind: 'quiet' }, '']);
  assert.equal((await store.take(RETURN_SESSION_ID)).length, 1, 'still there for a run that can say it');
});

// R3: a failure is not an alert, and it is not lost either - it is said where the alert would have been.
test('what could not be checked is said at the end of the turn, once per reason', async (t) => {
  const store = memoryStore();
  for (let run = 0; run < 2; run++) {
    await watchOn(t, { carried: 'value' }, SEARCHER, { channels: ['chat'] }, () =>
      JSON.stringify({ hook_event_name: 'SubagentStop', transcript_path: '/nowhere/at/all.jsonl', agent_id: SEARCHER, session_id: RETURN_SESSION_ID, cwd: '/work/the-app' }), true, store);
  }

  const said = await watchOn(t, { carried: 'value' }, SEARCHER, { channels: ['chat'] }, () => stopInput(), true, store);

  const { systemMessage } = JSON.parse(said.output) as { systemMessage: string };
  assert.match(systemMessage, /^agentwhy · Finished agent not checked: the session's records could not be read\./);
});

// `protected-everywhere` GD23: the computer's `watch` runs in every project, and says nothing where the project runs its
// own - one turn is never alerted twice. The person's own settings in the home folder are the computer's, no project's.
test('GD23: the computer’s watch is quiet in a project that runs its own, and speaks in one that does not', async (t) => {
  const own = JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }] } });
  const project = await writeSession(t, { '.claude/settings.local.json': own });
  const bare = await writeSession(t, { 'README.md': 'nothing here' });
  const home = await writeSession(t, { '.claude/settings.json': JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'agentwhy watch --everywhere' }] }] } }) });
  const input = (cwd: string) => (transcript: string): string => JSON.stringify({ hook_event_name: 'SubagentStop', transcript_path: transcript, agent_id: SEARCHER, cwd });

  const watched = await watchOn(t, { carried: 'value' }, SEARCHER, { everywhere: true }, input(project));
  assert.deepEqual([levelOf(watched), watched.output, watched.notified], ['quiet', '', []], 'the project’s own watch says it');
  assert.equal(levelOf(await watchOn(t, { carried: 'value' }, SEARCHER, { everywhere: true }, input(bare))), 'value');
  assert.equal(levelOf(await watchOn(t, { carried: 'value' }, SEARCHER, { everywhere: true }, input(home))), 'value');
  assert.equal(levelOf(await watchOn(t, { carried: 'value' }, SEARCHER, {}, input(project))), 'value', 'the project’s own watch speaks');
});
