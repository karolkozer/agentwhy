// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { CodexSessionDiscovery } from '../../../src/adapter/codex/discovery/codex-session-discovery.ts';
import { CodexSessionSource } from '../../../src/adapter/codex/events/codex-session-source.ts';
import { CodexTurnRefusals } from '../../../src/adapter/codex/hooks/stop-refusals.ts';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import { NodeFileSystem } from '../../../src/infrastructure/node-file-system.ts';
import type { AlertStore, RememberedAlert } from '../../../src/ports/alert-store.ts';
import { refusalReason } from '../../../src/refuse/render/refusal-words.ts';
import { codexTurnFormat } from '../../../src/report/watch/codex-turn-format.ts';
import { NoticeWordsRenderer } from '../../../src/report/watch/render/notice-words.ts';
import { SubagentWatch } from '../../../src/report/watch/subagent-watch.ts';
import { cell, cellOutput, command, given, item, meta, ROOT, said, TURN, turnContext } from '../../helpers/codex-session.ts';
import { CANARY, jsonl, writeSession } from '../../helpers/synthetic-session.ts';

// `2026-10-02-codex-says-it-too.md` CX1-CX7: Codex's Stop hook says what `watch` says for Claude Code. The value is
// invented and assembled at run time; it and the canary reach nothing the hook returns.
const files = new NodeFileSystem();
const VALUE = ['codex', 'orchid', '4821', CANARY].join('-');
const DESKTOP = { source: 'vscode', originator: 'Codex Desktop' };

function memoryStore(): AlertStore {
  const kept = new Map<string, RememberedAlert[]>();
  return {
    remember: async (sessionId, alert) => {
      kept.set(sessionId, [...(kept.get(sessionId) ?? []).filter((one) => one.agentId !== alert.agentId), alert]);
    },
    take: async (sessionId) => {
      const session = kept.get(sessionId) ?? [];
      kept.delete(sessionId);
      return session;
    },
    peek: async (sessionId) => kept.get(sessionId) ?? [],
  };
}

/** Claude Code settings running `refuse`, as `init --refuse` writes them; `command` names the rules it reads. */
function runsRefuse(command = 'agentwhy refuse', rest: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...rest, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command }] }] } });
}
const RUNS_REFUSE = runsRefuse();

/** A rollout in a project of its own: a turn that read a private file, or one that opened nothing. */
async function rollout(
  t: TestContext, who: Record<string, string>, lines: readonly object[], projectFiles: Record<string, string> = {},
): Promise<{ path: string; project: string }> {
  // The project is one the person set up: its Claude Code settings run `refuse` (CX9 with AO5 of
  // `2026-10-02-codex-approves-its-own-hook`), reading the built-in list.
  const project = await writeSession(t, { 'package.json': '{}', '.claude/settings.local.json': RUNS_REFUSE, ...projectFiles });
  const root = await writeSession(t, {
    'rollout.jsonl': jsonl(meta(ROOT, { cwd: project, ...who }), turnContext(TURN, { cwd: project }), given('user', 'What is in the config?'), ...lines),
  });
  return { path: join(root, 'rollout.jsonl'), project };
}

const readKey = (): object[] => {
  const env = `CODEX_TOKEN=${VALUE}\n`;
  return [
    cell('call_a', 'const r = await tools.exec_command({ cmd: "cat config/.env.codex" }); text(r.output)'),
    item(ROOT, command('exec_a', 'cat config/.env.codex', env)),
    cellOutput('call_a', env),
    said('msg_1', 'final_answer', `The token is ${VALUE}.`),
  ];
};

function codexWatch(text: string, store: AlertStore = memoryStore(), locale = 'pl_PL.UTF-8', threadIndex = '/nowhere/session_index.jsonl', home = '/Users/someone'): SubagentWatch {
  return new SubagentWatch({
    source: new CodexSessionSource({ discovery: new CodexSessionDiscovery({ directories: files, files }), files, sessionsRoot: '/nowhere/sessions' }),
    files,
    input: { readAll: async () => text },
    createRedactor: (projectRoot) => new Redactor('test', projectRoot, false),
    renderer: new NoticeWordsRenderer(),
    notifier: { notify: async () => true },
    home: '/Users/someone',
    store,
    preferencesPath: '/nowhere/notices.json',
    locale,
    invocation: { find: async () => 'agentwhy', version: async () => undefined },
    turnFormat: codexTurnFormat(files, new CodexTurnRefusals(files), threadIndex, home),
  });
}

const stopOf = (path: string, cwd: string, extra: object = {}): string =>
  JSON.stringify({ hook_event_name: 'Stop', session_id: ROOT, turn_id: TURN, transcript_path: path, cwd, stop_hook_active: false, ...extra });
const output = (text: string): { decision?: string; reason?: string; systemMessage?: string } => (text === '' ? {} : JSON.parse(text));

// CX1, CX3, CX6: a key read into a Codex chat in the desktop app is said by Codex, asked in the person's language.
test('a key from a private file in a Codex chat is said by Codex, in the person\'s language and few words', async (t) => {
  const { path, project } = await rollout(t, DESKTOP, readKey());

  const said_ = output((await codexWatch(stopOf(path, project)).run({ channels: ['chat'] })).output);

  assert.equal(said_.decision, 'block');
  assert.equal(said_.reason, '**agentwhy**: klucz z prywatnego pliku config/.env.codex jest teraz w tej rozmowie. Zrób dziś nowy klucz ' +
    'tam, gdzie go utworzono; usunięcie rozmowy tego nie cofnie. (Dla AI: odpowiedz jednym krótkim zdaniem; nie pokazuj klucza.)');
  assert.ok(!JSON.stringify(said_).includes(VALUE) && !JSON.stringify(said_).includes(CANARY), 'no value in anything the hook returns');
});

// CX4: nobody reads a scripted run, and a block would print an answer it never asked for.
test('a scripted Codex run gets the line, never a request', async (t) => {
  const { path, project } = await rollout(t, { source: 'exec', originator: 'codex_exec' }, readKey());

  const said_ = output((await codexWatch(stopOf(path, project)).run({ channels: ['chat'] })).output);

  assert.equal(said_.decision, undefined);
  assert.equal(said_.systemMessage, 'agentwhy · Pilnuję twoich prywatnych plików. Klucz z jednego z nich jest teraz w tej rozmowie — zmień go. Szczegóły: agentwhy report --open');
});

// CX2, CK13: a command agentwhy stopped is the turn's message, and nothing else is asked.
test('a command agentwhy stopped this turn is said first and alone, short and in the person\'s language', async (t) => {
  const reason = refusalReason('.env', '**/.env*', 0, { kind: 'named' }).trimEnd();
  const { path, project } = await rollout(t, DESKTOP, [
    cell('call_b', 'const r = await tools.exec_command({ cmd: "cat .env" }); text(r.output)'),
    cellOutput('call_b', `Script error:\nCommand blocked by PreToolUse hook: ${reason}. Command: cat .env`),
  ]);

  const said_ = output((await codexWatch(stopOf(path, project)).run({ channels: ['chat'] })).output);

  assert.equal(said_.decision, 'block');
  assert.equal(said_.reason, '**agentwhy** nie pozwolił AI odczytać prywatnego pliku .env. ' +
    '(Dla AI: odpowiedz jednym krótkim zdaniem i nie próbuj teraz odczytać go inaczej.)');
  assert.equal(said_.systemMessage, undefined);
  // Its continuation is left alone.
  assert.deepEqual(output((await codexWatch(stopOf(path, project, { stop_hook_active: true })).run({ channels: ['chat'] })).output).decision, undefined);
});

// CKB12: the measured Stop may carry no session id. The stopped command needs the turn alone, and is still said.
test('a stopped command is said on a Stop that names no session', async (t) => {
  const reason = refusalReason('.env', '**/.env*', 0, { kind: 'named' }).trimEnd();
  const { path, project } = await rollout(t, DESKTOP, [
    cell('call_b', 'const r = await tools.exec_command({ cmd: "cat .env" }); text(r.output)'),
    cellOutput('call_b', `Script error:\nCommand blocked by PreToolUse hook: ${reason}. Command: cat .env`),
  ]);
  const { session_id: _id, ...withoutSession } = JSON.parse(stopOf(path, project)) as Record<string, unknown>;

  const said_ = output((await codexWatch(JSON.stringify(withoutSession)).run({ channels: ['chat'] })).output);

  assert.equal(said_.decision, 'block');
  assert.match(said_.reason ?? '', /^\*\*agentwhy\*\* nie pozwolił AI odczytać prywatnego pliku \.env\./);
});

// CX5, found by review, with AO6: the rules are the ones the project's `refuse` reads - here the shared file, named by its
// own command - never a guess at the local file, which here holds none and would have called a protected file's key a
// clean turn.
test('the project\'s rules are the file Codex\'s refuse names', async (t) => {
  const token = `NOTES_TOKEN=${VALUE}\n`;
  const { path, project } = await rollout(t, DESKTOP, [
    cell('call_c', 'const r = await tools.exec_command({ cmd: "cat notes/private.txt" }); text(r.output)'),
    item(ROOT, command('exec_c', 'cat notes/private.txt', token)),
    cellOutput('call_c', token),
    said('msg_1', 'final_answer', `The token is ${VALUE}.`),
  ], {
    '.claude/settings.local.json': JSON.stringify({ permissions: { allow: [] } }),
    '.claude/settings.json': runsRefuse('agentwhy refuse --settings "$CLAUDE_PROJECT_DIR/.claude/settings.json"', {
      permissions: { deny: ['Read(./notes/private.txt)'] },
    }),
  });

  const said_ = output((await codexWatch(stopOf(path, project)).run({ channels: ['chat'] })).output);

  assert.equal(said_.decision, 'block');
  assert.match(said_.reason ?? '', /prywatnego pliku notes\/private\.txt/);
  assert.ok(!JSON.stringify(said_).includes(VALUE), 'no value in anything the hook returns');
});

// CX4, SW8: the first quiet turn, said by Codex in its apps, never in the terminal app.
test('the first quiet turn is said by Codex in its apps, and as the line in the terminal app', async (t) => {
  const quiet = [said('msg_1', 'final_answer', 'Two plus two is four.')];
  const desktop = await rollout(t, DESKTOP, quiet);
  const terminal = await rollout(t, { source: 'vscode', originator: 'codex-tui' }, quiet);

  const inApp = output((await codexWatch(stopOf(desktop.path, desktop.project), memoryStore(), 'en_GB.UTF-8').run({ channels: ['chat'] })).output);
  const inTerminal = output((await codexWatch(stopOf(terminal.path, terminal.project)).run({ channels: ['chat'] })).output);

  assert.equal(inApp.decision, 'block');
  // DESKTOP folds the turn away, so its quiet request asks the answer back (CXB5's display note).
  assert.equal(inApp.reason, '**agentwhy** is keeping watch over your private files: none has been opened so far. ' +
    '(For the AI: repeat your full answer for the user, then this in one sentence.)');
  assert.equal(inTerminal.decision, undefined);
  assert.match(inTerminal.systemMessage ?? '', /^agentwhy · ✓ Jak dotąd AI nie otworzyło żadnego prywatnego pliku/);
});

/*
 * CXB5, CX8, seen by the maintainer on 2026-10-02: the Codex apps give one visible conversation a new session id as it
 * goes on, and the line that says the watch is running came once per id - twice in one chat in VS Code, and in the
 * desktop app not at all, its turn counted as another conversation's. Said once a conversation: the thread's sessions
 * share its name in Codex's index, and the earliest of them is the key.
 */
test('one Codex conversation across two session ids hears the quiet line once', async (t) => {
  const quiet = [said('msg_1', 'final_answer', 'Two plus two is four.')];
  const first = await rollout(t, DESKTOP, quiet);
  const project = first.project;
  const second = await writeSession(t, {
    'rollout.jsonl': jsonl(meta('01a0another-session-of-it', { cwd: project, ...DESKTOP }), turnContext(TURN, { cwd: project }), given('user', 'And three?'), ...quiet),
  });
  const index = await writeSession(t, {
    'session_index.jsonl': jsonl(
      { id: ROOT, thread_name: 'Check the config', updated_at: '2026-10-02T11:00:00Z' },
      { id: '01a0another-session-of-it', thread_name: 'Check the config', updated_at: '2026-10-02T11:01:00Z' },
      { id: 'unrelated-session', thread_name: 'Another chat', updated_at: '2026-10-02T11:02:00Z' },
    ),
  });
  const indexPath = join(index, 'session_index.jsonl');
  const store = memoryStore();

  const one = output((await codexWatch(stopOf(first.path, project), store, 'pl_PL.UTF-8', indexPath).run({ channels: ['chat'] })).output);
  const secondStop = JSON.stringify({ hook_event_name: 'Stop', session_id: '01a0another-session-of-it', turn_id: TURN,
    transcript_path: join(second, 'rollout.jsonl'), cwd: project, stop_hook_active: false });
  const two = output((await codexWatch(secondStop, store, 'pl_PL.UTF-8', indexPath).run({ channels: ['chat'] })).output);

  assert.equal(one.decision, 'block', 'the first quiet turn is said by the agent');
  assert.deepEqual(two, {}, 'the next session of the same conversation says nothing');
});

/*
 * CX9, seen by the maintainer on 2026-10-02 (CXB6): a conversation in the desktop app's own scratch folder got the
 * quiet line, because the old hook pair sat in the user-level hooks file and fired everywhere. Outside a project the
 * person set up - no Claude Code settings running `refuse` above the turn's folder (AO5) - agentwhy says nothing, even
 * over a key; a command it refused is still said, whoever installed the hook.
 */
test('outside a set-up project the hook says nothing, and a refusal is still said', async (t) => {
  const bare = await writeSession(t, { 'package.json': '{}' });
  const root = await writeSession(t, {
    'rollout.jsonl': jsonl(meta(ROOT, { cwd: bare, ...DESKTOP }), turnContext(TURN, { cwd: bare }), given('user', 'What is in the config?'), ...readKey()),
  });

  const result = await codexWatch(stopOf(join(root, 'rollout.jsonl'), bare)).run({ channels: ['chat'] });
  assert.deepEqual([result.notice, result.output], [{ kind: 'quiet' }, ''], 'no project, no voice - even over a key');

  const reason = refusalReason('.env', '**/.env*', 0, { kind: 'named' }).trimEnd();
  const refused = await writeSession(t, {
    'rollout.jsonl': jsonl(meta(ROOT, { cwd: bare, ...DESKTOP }), turnContext(TURN, { cwd: bare }), given('user', 'Read it'),
      cell('call_r', 'const r = await tools.exec_command({ cmd: "cat .env" }); text(r.output)'),
      cellOutput('call_r', `Script error:\nCommand blocked by PreToolUse hook: ${reason}. Command: cat .env`)),
  });

  const said_ = output((await codexWatch(stopOf(join(refused, 'rollout.jsonl'), bare)).run({ channels: ['chat'] })).output);
  assert.equal(said_.decision, 'block', 'a refusal is credited wherever the hook ran');
});

// §4: only Stop is this hook's.
test('any other Codex event says nothing', async () => {
  const result = await codexWatch(JSON.stringify({ hook_event_name: 'SubagentStop', session_id: ROOT })).run({ channels: ['chat', 'os'] });
  assert.deepEqual([result.notice, result.output], [{ kind: 'quiet' }, '']);
});

// `protected-everywhere` GD23: where the computer's alerts are on, every project is watched - Codex's conversations too,
// outside any project the person set up.
test('GD23: with the computer\u2019s alerts on, a Codex chat outside a set-up project is watched', async (t) => {
  const bare = await writeSession(t, { 'package.json': '{}' });
  const root = await writeSession(t, {
    'rollout.jsonl': jsonl(meta(ROOT, { cwd: bare, ...DESKTOP }), turnContext(TURN, { cwd: bare }), given('user', 'What is in the config?'), ...readKey()),
  });
  const everywhere = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'agentwhy watch --everywhere' }] }] } };
  const home = await writeSession(t, { '.claude/settings.json': JSON.stringify(everywhere) });
  const result = await codexWatch(stopOf(join(root, 'rollout.jsonl'), bare), memoryStore(), 'pl_PL.UTF-8', '/nowhere/session_index.jsonl', home).run({ channels: ['chat'] });
  assert.equal(output(result.output).decision, 'block', 'the key is said, as in a set-up project');

  const off = await writeSession(t, { '.claude/settings.json': JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }] } }) });
  const quiet = await codexWatch(stopOf(join(root, 'rollout.jsonl'), bare), memoryStore(), 'pl_PL.UTF-8', '/nowhere/session_index.jsonl', off).run({ channels: ['chat'] });
  assert.deepEqual([quiet.notice, quiet.output], [{ kind: 'quiet' }, ''], 'a watch of the person\u2019s own is not the computer\u2019s alerts');
});
