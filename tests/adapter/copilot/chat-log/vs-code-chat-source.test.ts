// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { VsCodeChatSource } from '../../../../src/adapter/copilot/chat-log/vs-code-chat-source.ts';
import type { ToolEvent } from '../../../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { refusalReason } from '../../../../src/refuse/render/refusal-words.ts';
import { buildReport } from '../../../../src/report/build-report.ts';
import { gapReasons } from '../../../../src/report/gap-reasons.ts';
import { listedFiles } from '../../../../src/report/render/report-page/files.ts';
import { ReportPageRenderer } from '../../../../src/report/render/report-page/report-page-renderer.ts';
import { TextReportRenderer } from '../../../../src/report/render/text-report-renderer.ts';
import { CANARY, jsonl, writeSession } from '../../../helpers/synthetic-session.ts';
import {
  CHAT, PROJECT, callId, chatLog, handed, markdown, terminal, toolPart, tree, workspaceFiles, type ChatRequest,
} from '../../../helpers/vs-code-chat.ts';

// `.ai/plans/2026-10-13-what-vs-code-copilot-wrote.md` step 2: every measured shape of VS Code's chat log, read into the
// core's model - on synthetic logs, fictional values, the canary in every free text.

const files = new NodeFileSystem();
const source = new VsCodeChatSource({ files });
const UUID = '33333333-3333-4333-8333-333333333333';
const ENV = `${PROJECT}/.env`;
// A value shaped like no real key, assembled at run time.
const SECRET = ['canary', 'orchid', '4821', CANARY].join('-');

async function read(t: Parameters<typeof writeSession>[0], requests: readonly ChatRequest[], options: { readonly version?: number } = {}): Promise<SessionModel> {
  const root = await writeSession(t, workspaceFiles(chatLog(requests, options)));
  return source.read(join(root, 'ws1', 'chatSessions', `${CHAT}.jsonl`));
}

function eventOf(model: SessionModel, id: string): ToolEvent {
  const event = model.events.find((each) => each.id === id);
  assert.ok(event !== undefined, `the call ${id} was read`);
  return event;
}

test('a read: the file it named, its text from the result tree, the project from workspace.json (VCB-M6, VCB-M17)', async (t) => {
  const model = await read(t, [{
    calls: [{ id: 'call_READ', name: 'read_file', args: { filePath: `${PROJECT}/README.md`, startLine: 1, endLine: 2 }, result: tree(['# shop', 'a fictional store'], `${PROJECT}/README.md`) }],
    parts: [markdown('Reading it.'), toolPart('call_READ', 'copilot_readFile', { confirmed: 1, files: [`${PROJECT}/README.md`] }), markdown('Done.')],
  }]);

  assert.equal(model.provider, 'copilot');
  assert.equal(model.sessionId, CHAT);
  assert.deepEqual(model.projectRoot, { kind: 'known', path: PROJECT });
  const event = eventOf(model, callId('call_READ'));
  assert.deepEqual([event.toolName, event.targets, event.resultShape, event.toolKnown, event.outcome], ['read_file', [`${PROJECT}/README.md`], 'content', true, 'succeeded']);
  assert.equal(event.result?.content, '# shop\na fictional store');
  assert.equal(event.result?.completeness, 'complete');
  assert.deepEqual(model.messages.map((message) => message.text), ['Reading it.', 'Done.']);
  assert.ok(model.contexts.some((context) => context.author === 'person' && context.text === CANARY), "the person's prompt");
  assert.deepEqual(model.gaps.filter((gap) => gap.source === undefined), [], 'nothing of this chat is missing');
});

test('a terminal command: its line, its folder, its exit code - a failed run establishes nothing (VCB-M15, VCB-M19, X11)', async (t) => {
  const model = await read(t, [{
    calls: [
      { id: 'call_CAT', name: 'run_in_terminal', args: { command: 'cat .env', explanation: CANARY, goal: CANARY, mode: 'sync' }, result: `KEY=${SECRET}` },
      { id: 'call_MISS', name: 'run_in_terminal', args: { command: 'cat missing.env', explanation: CANARY, goal: CANARY, mode: 'sync' }, result: CANARY },
    ],
    parts: [
      toolPart('call_CAT', 'run_in_terminal', { confirmed: 4, specific: terminal(PROJECT, 0) }),
      toolPart('call_MISS', 'run_in_terminal', { confirmed: 4, specific: terminal(PROJECT, 1) }),
    ],
  }]);

  const cat = eventOf(model, callId('call_CAT'));
  assert.deepEqual([cat.commands, cat.workingDirectory, cat.execution, cat.outcome], [['cat .env'], PROJECT, { status: 'completed', exitCode: 0 }, 'succeeded']);
  const miss = eventOf(model, callId('call_MISS'));
  assert.deepEqual([miss.execution, miss.outcome], [{ status: 'failed', exitCode: 1 }, 'unknown']);

  const built = buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, false), { share: false, projectRoot: model.projectRoot });
  const outputs = [
    JSON.stringify(built), new ReportPageRenderer().render({ report: built, withIndexLink: false }),
    new TextReportRenderer(100, { ascii: false, full: true, colour: false }).render(built),
  ];
  assert.ok(built.tally.filesReached > 0, 'the .env it printed is a file reached');
  for (const output of outputs) assert.ok(!output.includes(SECRET) && !output.includes(CANARY), 'nothing a chat said reaches an output');
});

test('a terminal command whose part keeps no exit code is no run the record establishes', async (t) => {
  const model = await read(t, [{ calls: [{ id: 'call_RUN', name: 'run_in_terminal', args: { command: 'cat .env' }, result: CANARY }] }]);
  const event = eventOf(model, callId('call_RUN'));
  assert.deepEqual([event.execution?.status, event.outcome], ['unrecognised', 'unknown']);
  assert.ok(model.gaps.some((gap) => gap.kind === 'outcome-unrecognised'));
});

test('a patch writes each file it names, with the text it adds and never the text it takes out (CB23, R7)', async (t) => {
  const patch = [
    '*** Begin Patch', `*** Add File: ${PROJECT}/notes.md`, '+kept', `*** Update File: ${PROJECT}/app.ts`, '@@', ' same', '-gone', '+added', '*** End Patch',
  ].join('\n');
  const model = await read(t, [{
    calls: [{ id: 'call_PATCH', name: 'apply_patch', args: { input: patch, explanation: CANARY }, result: tree(['Done'], `${PROJECT}/notes.md`) }],
    parts: [toolPart('call_PATCH', 'copilot_applyPatch', { confirmed: 1 })],
  }]);
  const event = eventOf(model, callId('call_PATCH'));
  assert.deepEqual([event.targets, event.resultShape, event.written, event.outcome], [[`${PROJECT}/notes.md`, `${PROJECT}/app.ts`], 'none', ['kept\nadded'], 'succeeded']);
});

test("a hook's refusal is agentwhy's by refuse's own words, another hook's a check's; a refused call reads nothing (VC4, CPD12, WS9)", async (t) => {
  const reason = refusalReason(ENV, '**/.env', 0, { kind: 'named' });
  const model = await read(t, [{
    calls: [
      { id: 'call_OURS', name: 'read_file', args: { filePath: ENV, startLine: 1, endLine: 5 }, result: `Tool execution denied: ${reason}` },
      { id: 'call_THEIRS', name: 'run_in_terminal', args: { command: 'cat .env' }, result: `Tool execution denied: ${CANARY}` },
    ],
    // VCB-M12: a call a hook refused carries a part of its own id, which joins no call.
    parts: [{ kind: 'hook', hookType: 'PreToolUse', stopReason: CANARY }, toolPart(UUID, 'copilot_readFile', { confirmed: 0 }), toolPart(UUID, 'run_in_terminal', { confirmed: 0 })],
  }]);
  const ours = eventOf(model, callId('call_OURS'));
  assert.deepEqual([ours.outcome, ours.result?.refusedBy, ours.result?.denialKind], ['blocked', 'rule', 'denied']);
  const theirs = eventOf(model, callId('call_THEIRS'));
  assert.deepEqual([theirs.outcome, theirs.result?.refusedBy], ['blocked', 'check']);
  assert.equal(theirs.execution, undefined, 'a refused command did not run');
});

test("a person's Skip and cancel are the person's; an Allow lets the call run (VCB1, VCB-M9, VCB-M12)", async (t) => {
  const model = await read(t, [{
    calls: [
      { id: 'call_SKIP', name: 'run_in_terminal', args: { command: 'cat .env' }, result: 'The user chose to skip the tool call, they want to proceed without running it' },
      { id: 'call_STOP', name: 'run_in_terminal', args: { command: 'cat .env' }, result: 'The user cancelled the tool call.' },
      { id: 'call_ALLOW', name: 'run_in_terminal', args: { command: 'ls' }, result: 'README.md' },
    ],
    parts: [
      toolPart('call_SKIP', 'run_in_terminal', { confirmed: 5, specific: terminal(PROJECT) }),
      toolPart('call_STOP', 'run_in_terminal', { confirmed: 0, specific: terminal(PROJECT) }),
      toolPart('call_ALLOW', 'run_in_terminal', { confirmed: 4, specific: terminal(PROJECT, 0) }),
    ],
  }]);
  for (const [id, kind] of [['call_SKIP', 'skipped'], ['call_STOP', 'cancelled']] as const) {
    const event = eventOf(model, callId(id));
    assert.deepEqual([event.outcome, event.result?.refusedBy, event.result?.denialKind], ['blocked', 'person', kind]);
  }
  const allowed = eventOf(model, callId('call_ALLOW'));
  assert.deepEqual([allowed.outcome, allowed.result?.refusedBy], ['succeeded', undefined]);
});

test("a call that ran, printing a file that opens with VS Code's refusal words, is the file's text", async (t) => {
  const model = await read(t, [{
    calls: [{ id: 'call_ODD', name: 'read_file', args: { filePath: `${PROJECT}/odd.txt` }, result: 'Tool execution denied: not really' }],
    parts: [toolPart('call_ODD', 'copilot_readFile', { confirmed: 1 })],
  }]);
  const event = eventOf(model, callId('call_ODD'));
  assert.deepEqual([event.outcome, event.result?.refusedBy], ['succeeded', undefined]);
});

test("a part that says a call was refused, with no words this contract knows, is a marker not recognised", async (t) => {
  const model = await read(t, [{
    calls: [{ id: 'call_HUH', name: 'run_in_terminal', args: { command: 'ls' }, result: CANARY }],
    parts: [toolPart('call_HUH', 'run_in_terminal', { confirmed: 0 })],
  }]);
  assert.equal(eventOf(model, callId('call_HUH')).outcome, 'unknown');
  assert.ok(model.gaps.some((gap) => gap.kind === 'outcome-unrecognised'));
});

test("an output cut at VS Code's scrollback is partial: what it holds stands, the rest is not known (VC7, VCB-M15)", async (t) => {
  const model = await read(t, [{
    calls: [{ id: 'call_SEQ', name: 'run_in_terminal', args: { command: 'seq 1 30000' }, result: '29999\n30000\nOutput exceeded terminal scrollback; beginning of output was lost' }],
    parts: [toolPart('call_SEQ', 'run_in_terminal', { confirmed: 4, specific: terminal(PROJECT, 0) })],
  }]);
  assert.equal(eventOf(model, callId('call_SEQ')).result?.completeness, 'partial');
  assert.ok(model.gaps.some((gap) => gap.kind === 'result-incomplete'));
});

test('a helper: the runSubagent call delegates, its calls are its parts, a finished read reads a file whose text is not recorded (VCB-M16, VCD3)', async (t) => {
  const model = await read(t, [{
    calls: [{ id: 'call_HELP', name: 'runSubagent', args: { description: CANARY, prompt: 'read the readme' }, result: 'It describes a fictional store.' }],
    parts: [
      toolPart('call_HELP', 'runSubagent', { confirmed: 1, specific: { kind: 'subagent', description: CANARY, prompt: CANARY, result: CANARY } }),
      toolPart('call_HREAD', 'copilot_readFile', { helperOf: 'call_HELP', files: [`${PROJECT}/README.md`] }),
      toolPart('call_HLATE', 'copilot_readFile', { helperOf: 'call_HELP', complete: false, files: [`${PROJECT}/later.md`] }),
    ],
  }]);
  const [delegation] = model.delegations;
  assert.deepEqual([delegation?.id, delegation?.childAgentId, delegation?.prompt], [callId('call_HELP'), 'call_HELP', 'read the readme']);
  assert.equal(eventOf(model, callId('call_HELP')).result?.content, 'It describes a fictional store.', 'what the helper handed back');

  const readme = eventOf(model, 'call_HREAD');
  assert.deepEqual([readme.agentId, readme.toolName, readme.targets, readme.resultShape, readme.outcome, readme.result?.completeness], ['call_HELP', 'read_file', [`${PROJECT}/README.md`], 'content', 'succeeded', 'unknown']);
  const late = eventOf(model, 'call_HLATE');
  assert.deepEqual([late.outcome, late.result], ['unknown', undefined], 'a read not finished read nothing the record establishes');
  assert.ok(model.contexts.some((context) => context.agentId === 'call_HELP' && context.author === 'another-agent'), "the helper's prompt");
  assert.ok(model.capabilities.some((record) => record.agentId === 'call_HELP' && record.question === 'output-delivery' && record.state === 'absent'));
});

test('a helper no runSubagent part names still acted, and its missing start is said', async (t) => {
  const model = await read(t, [{ parts: [toolPart('call_LOST', 'copilot_readFile', { helperOf: 'call_NOBODY', files: [`${PROJECT}/a.md`] })] }]);
  assert.equal(eventOf(model, 'call_LOST').agentId, 'call_NOBODY');
  assert.ok(model.gaps.some((gap) => gap.kind === 'relation-unresolved' && gap.agentId === 'call_NOBODY'));
});

test('calls follow the parts that show them; a call no part shows comes before the next one shown (VCB-M12)', async (t) => {
  const model = await read(t, [{
    calls: [
      { id: 'call_A', name: 'read_file', args: { filePath: `${PROJECT}/a.md` }, result: 'a' },
      { id: 'call_B', name: 'read_file', args: { filePath: ENV }, result: `Tool execution denied: ${CANARY}` },
      { id: 'call_C', name: 'read_file', args: { filePath: `${PROJECT}/c.md` }, result: 'c' },
      { id: 'call_D', name: 'list_dir', args: { path: PROJECT }, result: tree(['a.md', 'c.md']) },
    ],
    parts: [
      toolPart('call_A', 'copilot_readFile', { confirmed: 1 }), markdown('Between.'), toolPart(UUID, 'copilot_readFile', { confirmed: 0 }),
      toolPart('call_C', 'copilot_readFile', { confirmed: 1 }),
    ],
  }]);
  const order = [...model.events].sort((x, y) => x.sequence - y.sequence).map((event) => event.id);
  assert.deepEqual(order, ['call_A', 'call_B', 'call_C', 'call_D'].map(callId));
  assert.ok(eventOf(model, callId('call_A')).evidence.record < (model.messages[0]?.evidence.record ?? 0), 'the text after the first call');
  assert.ok((model.messages[0]?.evidence.record ?? 0) < eventOf(model, callId('call_B')).evidence.record);
  assert.deepEqual([eventOf(model, callId('call_D')).targets, eventOf(model, callId('call_D')).resultShape], [[PROJECT], 'listing']);
});

test('the tools that reach no file, get_errors naming files, and a tool of no measured name a typed unknown (VC3)', async (t) => {
  const model = await read(t, [{
    calls: [
      { id: 'call_TODO', name: 'manage_todo_list', args: { todoList: [{ title: CANARY }] }, result: CANARY },
      { id: 'call_ERR', name: 'get_errors', args: { filePaths: [`${PROJECT}/app.ts`] }, result: tree(['No errors']) },
      { id: 'call_FIND', name: 'file_search', args: { query: '**/*.md' }, result: tree([`${PROJECT}/a.md`]) },
      { id: 'call_NEW', name: 'a_new_tool', args: { target: `${PROJECT}/x.md` }, result: CANARY },
    ],
  }]);
  assert.deepEqual([eventOf(model, callId('call_TODO')).targets, eventOf(model, callId('call_TODO')).resultShape], [[], 'none']);
  assert.deepEqual([eventOf(model, callId('call_ERR')).targets, eventOf(model, callId('call_ERR')).resultShape], [[`${PROJECT}/app.ts`], 'none']);
  assert.deepEqual([eventOf(model, callId('call_FIND')).resultShape, eventOf(model, callId('call_FIND')).toolKnown], ['listing', true]);
  assert.deepEqual([eventOf(model, callId('call_NEW')).targets, eventOf(model, callId('call_NEW')).toolKnown], [[`${PROJECT}/x.md`], false]);
});

test('a chat with no request has no call and nothing missing', async (t) => {
  const model = await read(t, []);
  assert.deepEqual([model.events, model.gaps.filter((gap) => gap.source === undefined)], [[], []]);
});

test('a log of a version not measured is not read, and nothing of it is known (VC2)', async (t) => {
  const model = await read(t, [{ calls: [{ id: 'call_READ', name: 'read_file', args: { filePath: ENV }, result: CANARY }] }], { version: 4 });
  assert.deepEqual(model.events, []);
  assert.ok(model.capabilities.some((record) => record.question === 'actions' && record.state === 'unmeasured'));
});

test('a part of a kind not measured leaves the chat not known whole (VCD4)', async (t) => {
  const model = await read(t, [{ parts: [{ kind: 'aNewPartKind', value: CANARY }] }]);
  assert.ok(model.capabilities.some((record) => record.question === 'actions' && record.state === 'unmeasured'));
});

test('the replay: a splice at i, a damaged line skipped, a change it cannot follow ends it - each said (VCB-M2)', async (t) => {
  const log = jsonl(
    { kind: 0, v: { version: 3, sessionId: CHAT, requests: [] } },
    'not json',
    { kind: 2, k: ['requests'], v: [{ requestId: 'r0', message: { text: 'first' }, response: [] }, { requestId: 'r1', message: { text: 'gone' }, response: [] }] },
    { kind: 2, k: ['requests'], v: [{ requestId: 'r1', message: { text: 'second' }, response: [] }], i: 1 },
    { kind: 1, k: ['requests', 9, 'result'], v: {} },
    { kind: 2, k: ['requests'], v: [{ requestId: 'r2', message: { text: 'never read' }, response: [] }] },
  );
  const root = await writeSession(t, workspaceFiles(log));
  const model = await source.read(join(root, 'ws1', 'chatSessions', `${CHAT}.jsonl`));
  assert.deepEqual(model.contexts.map((context) => context.text), ['first', 'second']);
  assert.equal(model.gaps.filter((gap) => gap.kind === 'record-damaged').length, 2, 'the line no JSON, and the stop');
});

test('a log kept outside a workspace has no project; an empty or missing one is no chat', async (t) => {
  const root = await writeSession(t, { 'loose.jsonl': chatLog([{ prompt: 'hello' }]), 'empty.jsonl': '' });
  const loose = await source.read(join(root, 'loose.jsonl'));
  assert.deepEqual([loose.sessionId, loose.projectRoot.kind], [CHAT, 'absent']);
  for (const name of ['empty.jsonl', 'nothing-here.jsonl']) {
    const model = await source.read(join(root, name));
    assert.ok(model.gaps.some((gap) => gap.kind === 'session-missing'), name);
  }
});

test("a file VS Code handed the model with a request is a read, before the request's calls, its text not recorded (VCD6, VCB-M21)", async (t) => {
  const model = await read(t, [{
    variables: [handed('open', ENV), handed('attached', `${PROJECT}/README.md`), handed('instructions', `${PROJECT}/CLAUDE.md`)],
    calls: [{ id: 'call_LS', name: 'list_dir', args: { path: PROJECT }, result: tree(['README.md']) }],
    parts: [toolPart('call_LS', 'copilot_listDirectory', { confirmed: 1 })],
  }]);
  const handedFiles = model.events.filter((event) => event.toolName === 'context');
  assert.deepEqual(handedFiles.map((event) => event.targets), [[ENV], [`${PROJECT}/README.md`], [`${PROJECT}/CLAUDE.md`]]);
  for (const event of handedFiles) {
    assert.deepEqual([event.outcome, event.resultShape, event.result?.content, event.result?.completeness], ['succeeded', 'content', undefined, 'unknown']);
  }
  assert.ok(handedFiles.every((event) => event.sequence < eventOf(model, callId('call_LS')).sequence), 'handed before any call');
  assert.ok(!model.gaps.some((gap) => gap.kind === 'result-incomplete'), "a text VS Code never writes down is no gap of this chat's");
  assert.ok(model.gaps.some((gap) => gap.kind === 'capability-absent' && gap.question === 'output-delivery' && gap.source !== undefined));

  const built = buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, false), { share: false, projectRoot: model.projectRoot });
  assert.equal(listedFiles(built), 3, 'each file it handed is listed');
  assert.ok(built.tally.contentsSeen > 0 || built.tally.filesReached > 0, 'the .env open in the editor reached the model');
});

test("a chat that handed only everyday files is whole but for VS Code's own silence, so its row can say Nothing private", async (t) => {
  const model = await read(t, [{ variables: [handed('instructions', `${PROJECT}/CLAUDE.md`)] }]);
  const built = buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, false), { share: false, projectRoot: model.projectRoot });
  assert.equal(listedFiles(built), 1);
  assert.deepEqual(gapReasons(model.gaps), { format: true });
  assert.equal(built.tally.filesReached, 0, 'nothing private');
});

test('a variable of a kind, or a value of a shape, not measured leaves the chat not known whole (VCD4)', async (t) => {
  for (const variable of [{ kind: 'paste', value: CANARY }, { kind: 'file', value: { scheme: 'untitled', path: CANARY } }]) {
    const model = await read(t, [{ variables: [variable] }]);
    assert.ok(model.capabilities.some((record) => record.question === 'actions' && record.state === 'unmeasured'), variable.kind);
    assert.ok(!model.events.some((event) => event.toolName === 'context'));
  }
});
