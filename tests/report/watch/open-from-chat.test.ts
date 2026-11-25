// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { SubagentWatch, type WatchOptions } from '../../../src/report/watch/subagent-watch.ts';
import { codexTurnFormat } from '../../../src/report/watch/codex-turn-format.ts';
import { NoticeWordsRenderer } from '../../../src/report/watch/render/notice-words.ts';
import { CodexTurnRefusals } from '../../../src/adapter/codex/hooks/stop-refusals.ts';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import { KeyMessageCheck } from '../../../src/message-check/key-message-check.ts';
import { OPEN_FROM_CHAT_SINCE, type OpenAsk } from '../../../src/open-from-chat/open-from-chat.ts';
import { NodeFileSystem } from '../../../src/infrastructure/node-file-system.ts';
import { writeSession } from '../../helpers/synthetic-session.ts';

// `2026-11-24-open-agentwhy-from-the-chat.md` RO2-RO4: one more question on the message's way in.
const files = new NodeFileSystem();
const STRIPE = ['sk', 'live', 'Q7mZp2Lx9TaV4cBn8RwE3yK'].join('_');
const watching = (command: string) => JSON.stringify({
  hooks: Object.fromEntries(['Stop', 'SubagentStop', 'UserPromptSubmit'].map((event) => [event, [{ hooks: [{ type: 'command', command }] }]])),
});
const RUNS_REFUSE = JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'agentwhy refuse' }] }] } });
const pinned = (version: string, rest = '') => `npx @agentwhy/cli@${version} watch${rest}`;

interface World {
  readonly prompt: string;
  readonly cwd: string;
  readonly home?: string;
  readonly entryPoint?: string;
  readonly projectDirectory?: string;
  readonly options?: Partial<WatchOptions>;
  readonly codex?: { readonly transcript?: string };
  readonly note?: string;
}

async function sent(world: World): Promise<{ readonly output: string; readonly asked: readonly OpenAsk[] }> {
  const asked: OpenAsk[] = [];
  const home = world.home ?? '/Users/someone';
  const text = JSON.stringify({
    hook_event_name: 'UserPromptSubmit', session_id: 's-1', prompt: world.prompt, cwd: world.cwd,
    ...(world.codex === undefined ? {} : { turn_id: 't', transcript_path: world.codex.transcript ?? null }),
  });
  let note = world.note;
  const watch = new SubagentWatch({
    source: { load: async () => undefined } as never,
    files,
    input: { readAll: async () => text },
    createRedactor: (root) => new Redactor('test', root, false),
    words: (wayIn) => new NoticeWordsRenderer(wayIn),
    notifier: { notify: async () => true },
    home,
    preferencesPath: join(home, 'notices.json'),
    store: { remember: async () => undefined, take: async () => [] } as never,
    invocation: { find: async () => 'agentwhy', version: async () => undefined },
    messages: new KeyMessageCheck({
      envBlocked: async () => false,
      memory: { keep: async () => undefined, take: async () => { const kept = note; note = undefined; return kept; }, wentBefore: async () => true, markWent: async () => undefined },
    }),
    opens: { answer: async (ask) => (asked.push(ask), 'OPENED') },
    ...(world.codex === undefined && world.entryPoint !== undefined ? { entryPoint: world.entryPoint } : {}),
    ...(world.projectDirectory === undefined ? {} : { projectDirectory: world.projectDirectory }),
    ...(world.codex === undefined ? {} : { turnFormat: codexTurnFormat(files, new CodexTurnRefusals(files), home) }),
  });
  return { output: (await watch.run(world.options ?? {})).output, asked };
}

const setUp = (t: TestContext, command = 'agentwhy watch') => writeSession(t, { '.claude/settings.local.json': watching(command) });

test('RO2-RO4: the phrase opens agentwhy for the project, and its words go to the AI', async (t) => {
  const project = await setUp(t);
  const { output, asked } = await sent({ prompt: 'open agentwhy', cwd: project, entryPoint: 'cli' });
  assert.equal(output, 'OPENED');
  assert.deepEqual(asked, [{ request: 'page', folder: project, sessionKey: 's-1', plugin: false }]);
});

test('RO4: the project Claude Code names wins over the folder the message was written in', async (t) => {
  const project = await setUp(t);
  const { asked } = await sent({ prompt: 'open agentwhy’s report', cwd: join(project, 'src'), projectDirectory: project, entryPoint: 'claude-vscode' });
  assert.deepEqual(asked, [{ request: 'report', folder: project, sessionKey: 's-1', plugin: false }]);
});

test('any other message goes on with nothing said', async (t) => {
  const project = await setUp(t);
  assert.deepEqual(await sent({ prompt: 'open agentwhy and fix the bug', cwd: project, entryPoint: 'cli' }), { output: '', asked: [] });
});

test('RO3: nothing is opened where no person is, or nobody is known to be', async (t) => {
  const project = await setUp(t);
  for (const entryPoint of ['sdk-cli', 'openbot', 'sdk-ts', undefined]) {
    assert.deepEqual(await sent({ prompt: 'open agentwhy', cwd: project, ...(entryPoint === undefined ? {} : { entryPoint }) }), { output: '', asked: [] }, String(entryPoint));
  }
});

test('RO2: a key beside the phrase is refused, and nothing is opened', async (t) => {
  const project = await setUp(t);
  const { output, asked } = await sent({ prompt: STRIPE, cwd: project, entryPoint: 'cli' });
  assert.equal((JSON.parse(output) as { decision: string }).decision, 'block');
  assert.deepEqual(asked, []);
});

test('RO5: what is kept from a refused message is said first', async (t) => {
  const project = await setUp(t);
  assert.equal((await sent({ prompt: 'open agentwhy', cwd: project, entryPoint: 'cli', note: 'KEPT' })).output, 'KEPT\n\nOPENED');
});

test('ROD8: outside a set-up project it is the computer’s own page, and no conversation is asked for', async (t) => {
  const bare = await writeSession(t, { 'README.md': 'nothing here' });
  const { asked } = await sent({ prompt: 'open agentwhy report', cwd: bare, entryPoint: 'cli' });
  assert.deepEqual(asked, [{ request: 'page', folder: '/Users/someone', plugin: false }]);
});

test('RO2: the computer’s copy leaves it to the project’s own that knows the phrase', async (t) => {
  for (const command of ['agentwhy watch', 'npx @agentwhy/cli watch', 'node /somewhere/dist/agentwhy/cli.js watch', pinned(OPEN_FROM_CHAT_SINCE)]) {
    const project = await setUp(t, command);
    const { output, asked } = await sent({ prompt: 'open agentwhy', cwd: project, entryPoint: 'cli', options: { everywhere: true } });
    assert.deepEqual([output, asked], ['', []], command);
  }
});

test('RO2: it answers beside a project’s own pinned to a release before the phrase, and leaves the key check to it', async (t) => {
  const project = await setUp(t, pinned('0.9.0'));
  const opened = await sent({ prompt: 'open agentwhy', cwd: project, entryPoint: 'cli', options: { everywhere: true }, note: 'KEPT' });
  assert.equal(opened.output, 'OPENED', 'the kept note is the other copy’s to say');
  assert.deepEqual(opened.asked, [{ request: 'page', folder: project, sessionKey: 's-1', plugin: false }]);
  assert.deepEqual(await sent({ prompt: STRIPE, cwd: project, entryPoint: 'cli', options: { everywhere: true } }), { output: '', asked: [] });
});

test('RO2: the plugin’s copy leaves it to the person’s own that knows the phrase, and answers beside an older one', async (t) => {
  const project = await writeSession(t, { 'README.md': 'nothing here' });
  for (const [version, opens] of [[OPEN_FROM_CHAT_SINCE, 0], ['0.9.0', 1]] as const) {
    const home = await writeSession(t, { '.claude/settings.json': watching(pinned(version, ' --everywhere')) });
    const { asked } = await sent({ prompt: 'open agentwhy', cwd: project, home, entryPoint: 'claude-desktop', options: { everywhere: true, plugin: true } });
    assert.equal(asked.length, opens, version);
    if (opens === 1) assert.equal(asked[0]?.plugin, true, 'AP13: the plugin’s server says where the plugin is updated');
  }
});

test('RO2: with an older project’s copy and the person’s newer one, the plugin’s stays quiet: one page', async (t) => {
  const project = await setUp(t, pinned('0.9.0'));
  const home = await writeSession(t, { '.claude/settings.json': watching(`agentwhy watch --everywhere`) });
  const world = { prompt: 'open agentwhy', cwd: project, home, entryPoint: 'cli' };
  assert.equal((await sent({ ...world, options: { everywhere: true, plugin: true } })).asked.length, 0);
  assert.equal((await sent({ ...world, options: { everywhere: true } })).asked.length, 1);
});

// Codex: one hook for every folder, so the project is looked for above the message's own (AO5).
const rollout = (t: TestContext, meta: object) => writeSession(t, { 'rollout.jsonl': `${JSON.stringify({ type: 'session_meta', payload: meta })}\n` });

test('RO4: in Codex the project is the nearest set-up folder above, and the report is the Codex conversation’s', async (t) => {
  const project = await writeSession(t, { '.claude/settings.local.json': RUNS_REFUSE, 'src/app.ts': '' });
  const root = await rollout(t, { source: 'vscode', originator: 'Codex Desktop' });
  const codex = { transcript: join(root, 'rollout.jsonl') };
  const { output, asked } = await sent({ prompt: 'otwórz raport agentwhy', cwd: join(project, 'src'), codex });
  assert.equal(output, 'OPENED');
  assert.deepEqual(asked, [{ request: 'report', folder: project, sessionKey: 'codex-s-1', plugin: false }]);
});

test('ROD8: a Codex scratch folder is the computer’s own page', async (t) => {
  const scratch = await writeSession(t, { 'notes.md': '' });
  const root = await rollout(t, { source: 'vscode', originator: 'Codex Desktop' });
  const { asked } = await sent({ prompt: 'open agentwhy', cwd: scratch, codex: { transcript: join(root, 'rollout.jsonl') } });
  assert.deepEqual(asked, [{ request: 'page', folder: '/Users/someone', plugin: false }]);
});

test('RO3: a Codex script, or a conversation with no record to read, opens nothing', async (t) => {
  const project = await writeSession(t, { '.claude/settings.local.json': RUNS_REFUSE });
  const script = await rollout(t, { source: 'exec', originator: 'codex_exec' });
  for (const codex of [{ transcript: join(script, 'rollout.jsonl') }, { transcript: '/nowhere/rollout.jsonl' }, {}]) {
    assert.deepEqual(await sent({ prompt: 'open agentwhy', cwd: project, codex }), { output: '', asked: [] });
  }
});
