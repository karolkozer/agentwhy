// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { CopilotSessionSource } from '../../../../src/adapter/copilot/events/copilot-session-source.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import { buildReport } from '../../../../src/report/build-report.ts';
import type { ReportModel } from '../../../../src/report/report-model.ts';
import { ReportPageRenderer } from '../../../../src/report/render/report-page/report-page-renderer.ts';
import { TextReportRenderer } from '../../../../src/report/render/text-report-renderer.ts';
import type { ToolEvent } from '../../../../src/core/event.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { refusalReason } from '../../../../src/refuse/render/refusal-words.ts';
import { CANARY, writeSession } from '../../../helpers/synthetic-session.ts';
import {
  AGENT, CALL, FORK, PROJECT, REQUEST, SECOND_CALL, SESSION, TASK_CALL, abort, assistantMessage, compactionComplete, editorStart,
  hookEnd, hookStart, modelMessage, permissionCompleted, permissionRequested, records, sessionResume, sessionStart, spilledResult,
  subagentStarted, systemMessage, toolRefused, toolResult, toolStart, turnEnd, turnStart, userMessage, workspaceYaml, type Draft,
} from '../../../helpers/copilot-session.ts';

const files = new NodeFileSystem();
const source = new CopilotSessionSource({ directories: files, files });

/** One session folder under a fresh root, read by the source; `extra` adds other folders beside it. */
async function read(t: Parameters<typeof writeSession>[0], drafts: readonly Draft[], extra: Record<string, string> = {}): Promise<SessionModel> {
  const root = await writeSession(t, {
    [`${SESSION}/events.jsonl`]: records(SESSION, sessionStart(SESSION), userMessage(), ...drafts),
    [`${SESSION}/workspace.yaml`]: workspaceYaml({ id: SESSION, cwd: PROJECT }),
    ...extra,
  });
  return source.read(join(root, SESSION));
}

function eventOf(model: SessionModel, id: string): ToolEvent {
  const event = model.events.find((each) => each.id === id);
  assert.ok(event !== undefined, `the call ${id} was read`);
  return event;
}

// A value shaped like no real key, assembled at run time.
const SECRET = ['canary', 'orchid', '4821', CANARY].join('-');

function report(model: SessionModel): ReportModel {
  return buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, false), { share: false, projectRoot: model.projectRoot });
}

/** Every output a person or a script can see of this report: none may hold the value or the canary. */
function assertNothingLeaks(built: ReportModel): void {
  const outputs = [
    JSON.stringify(built), new ReportPageRenderer().render({ report: built, withIndexLink: false }),
    new TextReportRenderer(100, { ascii: false, full: true, colour: false }).render(built),
  ];
  for (const output of outputs) {
    assert.ok(!output.includes(SECRET), 'the value never reaches an output');
    assert.ok(!output.includes(CANARY), 'nor anything else a record carried');
  }
}

const call = (id: string, name: string, args: Record<string, unknown>): Draft[] => [assistantMessage('', [{ callId: id, name, arguments: args }]), toolStart(id, name, args)];

test('each measured tool is read by its profile: what it addressed, what it is, what it wrote (CP8, plan step 4)', async (t) => {
  const model = await read(t, [
    ...call('call_VIEW', 'view', { path: `${PROJECT}/README.md`, view_range: [1, 20] }), toolResult('call_VIEW', '# shop', { detailedContent: CANARY }),
    ...call('call_GLOB', 'glob', { pattern: '**/*.ts', paths: PROJECT }), toolResult('call_GLOB', `${PROJECT}/src/app.ts`),
    ...call('call_RG', 'rg', { pattern: 'KEY', paths: [PROJECT], output_mode: 'content' }), toolResult('call_RG', 'src/app.ts:1:KEY'),
    ...call('call_NAMES', 'rg', { pattern: 'KEY', paths: [PROJECT], output_mode: 'files_with_matches' }), toolResult('call_NAMES', 'src/app.ts'),
    ...call('call_NEW', 'create', { path: `${PROJECT}/notes.md`, file_text: CANARY }), toolResult('call_NEW', 'Created'),
    ...call('call_EDIT', 'edit', { path: `${PROJECT}/notes.md`, old_str: 'gone', new_str: 'kept' }), toolResult('call_EDIT', 'Edited'),
    ...call('call_MCP', 'github-mcp-server-search_repositories', { query: 'octocat/Hello-World' }), toolResult('call_MCP', '{}'),
  ]);

  const view = eventOf(model, 'call_VIEW');
  assert.deepEqual([view.targets, view.resultShape, view.toolKnown], [[`${PROJECT}/README.md`], 'content', true]);
  assert.equal(view.result?.content, '# shop', "view's detailedContent is the interface's diff, never the model's (CPB48)");
  assert.deepEqual([eventOf(model, 'call_GLOB').targets, eventOf(model, 'call_GLOB').resultShape], [[PROJECT], 'listing']);
  assert.equal(eventOf(model, 'call_RG').printsMatches, true);
  assert.equal(eventOf(model, 'call_NAMES').printsMatches, undefined, 'files_with_matches prints names alone (CPB57)');
  assert.deepEqual(eventOf(model, 'call_NEW').written, [CANARY]);
  assert.deepEqual(eventOf(model, 'call_EDIT').written, ['kept'], 'the text an edit takes out was in the file already');
  const mcp = eventOf(model, 'call_MCP');
  assert.deepEqual([mcp.toolKnown, mcp.targets, mcp.outcome], [false, ['octocat/Hello-World'], 'succeeded']);
  for (const event of model.events) {
    assert.equal(event.workingDirectory, PROJECT, 'each call ran in the session folder (CPB46)');
    assert.equal(event.turnId, undefined, 'no turn id names one turn (CP32)');
  }
  assert.equal(model.provider, 'copilot');
  assert.deepEqual(model.turns, []);
});

test("bash: one command, its exit code its execution, and what it printed without the runtime's last line (CPB47, X11)", async (t) => {
  const model = await read(t, [
    ...call(CALL, 'bash', { command: 'cat .env', description: 'read it' }),
    toolResult(CALL, `KEY=${CANARY}\n<shellId: 3 completed with exit code 0>`, { exitCode: 0 }),
    ...call(SECOND_CALL, 'bash', { command: 'cat missing.txt' }),
    toolResult(SECOND_CALL, 'cat: missing.txt: No such file or directory\n<shellId: 4 completed with exit code 1>', { exitCode: 1 }),
  ]);

  const read1 = eventOf(model, CALL);
  assert.deepEqual(read1.commands, ['cat .env']);
  assert.deepEqual(read1.execution, { status: 'completed', exitCode: 0 });
  assert.equal(read1.result?.printedText, `KEY=${CANARY}`);
  assert.equal(read1.outcome, 'succeeded');
  const failed = eventOf(model, SECOND_CALL);
  assert.deepEqual(failed.execution, { status: 'failed', exitCode: 1 });
  assert.equal(failed.outcome, 'unknown', 'a failed cat establishes no read');
});

test('who stopped a call: a rule, agentwhy, another check, a person - and an opening no one measured (CP19, CPD12, WS9)', async (t) => {
  const agentwhys = `Denied by preToolUse hook: ${refusalReason(`${PROJECT}/.env`, '**/.env', 0, { kind: 'search' })}`;
  const model = await read(t, [
    ...call('call_RULE', 'bash', { command: 'cat .env' }), toolRefused('call_RULE', 'rule'),
    ...call('call_CHECK', 'bash', { command: 'cat .env' }), toolRefused('call_CHECK', 'check'),
    ...call('call_OURS', 'bash', { command: 'grep -r KEY .' }),
    { type: 'tool.execution_complete', data: { toolCallId: 'call_OURS', success: false, error: { code: 'denied', message: agentwhys } } },
    ...call('call_ODD', 'bash', { command: 'ls' }), toolRefused('call_ODD', 'unknown'),
    ...call('call_FAIL', 'view', { path: 'x' }),
    { type: 'tool.execution_complete', data: { toolCallId: 'call_FAIL', success: false, error: { code: CANARY, message: CANARY } } },
    ...call('call_ASKED', 'bash', { command: 'rm -rf build' }), permissionRequested(REQUEST, 'call_ASKED'), permissionCompleted(REQUEST, 'call_ASKED'), abort(),
  ]);

  const by = (id: string) => [eventOf(model, id).outcome, eventOf(model, id).result?.refusedBy];
  assert.deepEqual(by('call_RULE'), ['blocked', 'rule']);
  assert.deepEqual(by('call_CHECK'), ['blocked', 'check'], 'a hook whose words are not agentwhy is a check, never a rule');
  assert.deepEqual(by('call_OURS'), ['blocked', 'rule']);
  assert.ok(eventOf(model, 'call_OURS').targets.includes(`${PROJECT}/.env`), "refuse's sentence names the file a search would have read");
  assert.deepEqual(by('call_ODD'), ['unknown', undefined]);
  assert.deepEqual(by('call_FAIL'), ['unknown', undefined], 'an error no measurement covers says nothing of what the call reached');
  assert.deepEqual(by('call_ASKED'), ['blocked', 'person']);
  assert.ok(model.gaps.some((gap) => gap.kind === 'outcome-unrecognised'));
  assert.equal(JSON.stringify(model.gaps).includes(CANARY), false);
});

test('a result past its preview is partial, with a gap, and a spilled listing establishes no reach (CP25, LN1)', async (t) => {
  const model = await read(t, [...call(CALL, 'bash', { command: 'ls -R' }), spilledResult(CALL)]);

  const event = eventOf(model, CALL);
  assert.equal(event.result?.completeness, 'partial');
  assert.equal(event.result?.printedText, undefined, "a preview is the runtime's words and part of an output, not what the command printed");
  assert.ok(model.gaps.some((gap) => gap.kind === 'result-incomplete' && gap.source === undefined), "the conversation's gap, not the format's (F17)");
  assert.ok(model.gaps.some((gap) => gap.kind === 'capability-absent' && gap.eventId === CALL));
});

test('a sync task returns its work, joined by ids to the agent it started and the calls that agent made (CP11, CPB53)', async (t) => {
  const by = { agentId: AGENT, taskCall: TASK_CALL };
  const model = await read(t, [
    ...call(TASK_CALL, 'task', { prompt: CANARY, description: 'Look around', name: 'look', mode: 'sync', agent_type: 'explore' }),
    subagentStarted(AGENT, TASK_CALL),
    { ...userMessage('Look around the project.'), agentId: AGENT },
    toolStart(CALL, 'view', { path: `${PROJECT}/.env` }, by), toolResult(CALL, `KEY=${CANARY}`, { agentId: AGENT }),
    { ...assistantMessage('Found the key file.'), agentId: AGENT },
    toolResult(TASK_CALL, 'Found the key file.'),
  ]);

  const [delegation] = model.delegations;
  assert.equal(delegation?.childAgentId, AGENT);
  assert.equal(delegation?.requestedType, 'explore');
  assert.equal(delegation?.prompt, CANARY);
  assert.equal(delegation?.depth, undefined, 'no depth is recorded, so none is given (§4.3 rule 4)');
  assert.equal(eventOf(model, CALL).agentId, AGENT);
  assert.equal(eventOf(model, TASK_CALL).result?.launchNotice, undefined);
  assert.ok(model.contexts.some((context) => context.agentId === AGENT && context.author === 'another-agent'), "its prompt is the starting agent's words (CP30)");
  assert.ok(model.messages.some((message) => message.agentId === AGENT && message.text === 'Found the key file.'));
  assert.equal(model.gaps.filter((gap) => gap.kind === 'relation-unresolved').length, 0);
});

test('a background task says only that it started; read_agent brings its work back, once, as the report (CPB53-CPB55, CP28)', async (t) => {
  const model = await read(t, [
    ...call(TASK_CALL, 'task', { prompt: CANARY, description: 'Look around', name: 'look', mode: 'background', agent_type: 'explore' }),
    subagentStarted(AGENT, TASK_CALL),
    toolResult(TASK_CALL, `Agent started in background with agent_id: ${AGENT}.`),
    { type: 'system.notification', data: { content: '<system_notification> Agent "look" (explore) has finished.', kind: { type: 'agent_idle', agentId: AGENT } } },
    ...call('call_READ', 'read_agent', { agent_id: AGENT, since_turn: 0 }),
    toolResult('call_READ', `Agent is idle (waiting for messages).\n\nKEY=${CANARY}`),
  ]);

  assert.equal(eventOf(model, TASK_CALL).result?.launchNotice, true);
  const [delegation] = model.delegations;
  assert.equal(delegation?.reports.length, 1);
  assert.ok(delegation?.reports[0]?.content.includes(CANARY));
  const collected = eventOf(model, 'call_READ');
  assert.equal(collected.result?.content, undefined, 'the work is carried once, as the report');
  assert.equal(collected.outcome, 'succeeded');
  assert.ok(model.contexts.some((context) => context.author === 'runtime' && context.text.includes('system_notification')), 'a notice, never an action (CP30)');
});

test('a call whose agent no start names stays that agent, and the missing join is said (CP11, HR7)', async (t) => {
  const model = await read(t, [toolStart(CALL, 'view', { path: 'x' }, { agentId: AGENT, taskCall: TASK_CALL }), toolResult(CALL, 'x', { agentId: AGENT })]);

  assert.ok(model.agents.some((agent) => agent.id === AGENT));
  assert.ok(model.gaps.some((gap) => gap.kind === 'relation-unresolved' && gap.agentId === AGENT));
  assert.equal(model.completeness, 'unresolved');
});

test("words: the agent's own with their channel; the person's, the runtime's and a summary as context; reasoning never (CP16, CP27, CP31)", async (t) => {
  const model = await read(t, [
    systemMessage(), turnStart(),
    { type: 'assistant.message', data: { messageId: SESSION, content: 'Working on it.', phase: 'commentary', reasoningText: CANARY, toolRequests: [] } },
    { type: 'assistant.message', data: { messageId: FORK, content: 'Done.', phase: 'final_answer', toolRequests: [] } },
    compactionComplete(), turnEnd(),
  ]);

  assert.deepEqual(model.messages.map((message) => [message.text, message.channel, message.kind]), [['Working on it.', 'commentary', 'said'], ['Done.', 'final', 'said']]);
  assert.ok(model.messages.every((message) => !message.text.includes(CANARY)), 'reasoningText is never a message');
  assert.deepEqual(model.contexts.map((context) => context.author).sort(), ['developer', 'person', 'runtime']);
});

test('hooks, other models and settings are no action and no message; a record type or record key no one measured unmeasures the file (CP22, CPD13)', async (t) => {
  const quiet = await read(t, [hookStart('postToolUse', { toolResult: { textResultForLlm: CANARY } }), hookEnd('postToolUse'), modelMessage()]);
  assert.deepEqual([quiet.events.length, quiet.messages.length], [0, 0]);
  assert.ok(quiet.capabilities.every((record) => record.question === 'reasoning' || record.question === 'permissions' ? record.state === 'unmeasured' : record.state === 'supported'));

  const odd = await read(t, [{ type: 'session.new_kind_of_thing', data: {} }]);
  assert.ok(odd.capabilities.every((record) => record.state === 'unmeasured'));
  assert.ok(odd.gaps.some((gap) => gap.kind === 'capability-unmeasured' && gap.question === 'actions' && gap.source !== undefined), "the format's gap (F17)");
});

test("a build of the measured line takes its profile, and another line's answers nothing (CPD13)", async (t) => {
  const answered = async (version: string) => {
    const root = await writeSession(t, { [`${SESSION}/events.jsonl`]: records(SESSION, sessionStart(SESSION, { copilotVersion: version }), userMessage()) });
    return (await source.read(join(root, SESSION))).capabilities.find((record) => record.question === 'actions')?.state;
  };
  assert.equal(await answered('1.0.96'), 'supported');
  assert.equal(await answered('1.0.95-2'), 'supported');
  assert.equal(await answered('1.1.0'), 'unmeasured');
});

test("a fork's lines copied from its parent are read in the parent alone (CP26, CPB36)", async (t) => {
  const copied = [userMessage(), ...call(CALL, 'view', { path: `${PROJECT}/.env` }), toolResult(CALL, CANARY)];
  const parentFile = records(SESSION, sessionStart(SESSION), ...copied);
  // CPB36: the fork's first lines are its parent's, ids and all - its session.start too, carrying the fork's own id.
  const forkFile = records(SESSION, sessionStart(FORK), ...copied) + records(FORK, ...call(SECOND_CALL, 'view', { path: `${PROJECT}/README.md` }), toolResult(SECOND_CALL, '# shop'));
  const root = await writeSession(t, {
    [`${SESSION}/events.jsonl`]: parentFile,
    [`${SESSION}/workspace.yaml`]: workspaceYaml({ id: SESSION, cwd: PROJECT, forkCount: 1 }),
    [`${FORK}/events.jsonl`]: forkFile,
    [`${FORK}/workspace.yaml`]: workspaceYaml({ id: FORK, cwd: PROJECT }),
  });

  const fork = await source.read(join(root, FORK));
  assert.equal(fork.sessionId, FORK);
  assert.deepEqual(fork.events.map((event) => event.id), [SECOND_CALL]);
  const parent = await source.read(join(root, SESSION));
  assert.deepEqual(parent.events.map((event) => event.id), [CALL]);
  assert.equal(parent.gaps.filter((gap) => gap.kind === 'relation-unresolved').length, 0);
});

test('a resumed session goes on in its file, and its calls run where it resumed (CPB38)', async (t) => {
  const elsewhere = '/Users/someone/Projects/shop-two';
  const model = await read(t, [
    ...call(CALL, 'view', { path: 'a' }), toolResult(CALL, 'a'),
    { ...sessionResume(), data: { resumeTime: '2026-10-09T09:00:00.000Z', eventCount: 1, context: { cwd: elsewhere } } },
    ...call(SECOND_CALL, 'view', { path: 'b' }), toolResult(SECOND_CALL, 'b'),
  ]);

  assert.deepEqual(model.events.map((event) => event.workingDirectory), [PROJECT, elsewhere]);
});

test('a file that is no Copilot session, or a VS Code transcript, is no session to report on (CP1a)', async (t) => {
  const root = await writeSession(t, {
    [`${SESSION}/events.jsonl`]: records(SESSION, editorStart(SESSION), userMessage()),
    'other/events.jsonl': `${CANARY}\n`,
  });

  for (const input of [join(root, SESSION), join(root, SESSION, 'events.jsonl'), join(root, 'other'), join(root, 'nothing-here')]) {
    const model = await source.read(input);
    assert.deepEqual(model.gaps.map((gap) => gap.kind), ['session-missing'], input);
    assert.equal(model.events.length, 0);
  }
});

test('a damaged line is said and the rest of the file still read', async (t) => {
  const root = await writeSession(t, {
    [`${SESSION}/events.jsonl`]: records(SESSION, sessionStart(SESSION), userMessage(), ...call(CALL, 'view', { path: 'a' })) + '{"type": "tool.exec\n' +
      records(SESSION.replace('a1', 'a9'), toolResult(CALL, 'a')),
  });

  const model = await source.read(join(root, SESSION));
  assert.ok(model.gaps.some((gap) => gap.kind === 'record-damaged'));
  assert.equal(eventOf(model, CALL).outcome, 'succeeded');
});

// Plan step 4's cases through the report, on the default policy: what a person is shown of each.
test('view of a private file is a read of it, its value never shown, and a hook\'s copy of the result no second exposure', async (t) => {
  const model = await read(t, [
    ...call(CALL, 'view', { path: `${PROJECT}/.env` }),
    hookStart('postToolUse', { toolName: 'view', toolResult: { textResultForLlm: `API_KEY=${SECRET}` } }), hookEnd('postToolUse'),
    toolResult(CALL, `API_KEY=${SECRET}`, { detailedContent: `+API_KEY=${SECRET}` }),
  ]);

  const built = report(model);
  assert.equal(built.tally.filesReached, 1);
  assert.equal(built.tally.contentsSeen, 1);
  assert.deepEqual(built.privateFiles.map((file) => file.names.map(String)), [['API_KEY']]);
  assertNothingLeaks(built);
});

test("a subagent's rg that prints a private file's line is a read by that subagent, under the task that started it", async (t) => {
  const by = { agentId: AGENT, taskCall: TASK_CALL };
  const model = await read(t, [
    ...call(TASK_CALL, 'task', { prompt: 'Find the config.', description: 'Find config', name: 'find', mode: 'sync', agent_type: 'explore' }),
    subagentStarted(AGENT, TASK_CALL),
    toolStart(CALL, 'rg', { pattern: 'API_KEY', paths: [PROJECT], output_mode: 'content' }, by),
    toolResult(CALL, `${PROJECT}/.env:1:API_KEY=${SECRET}`, { agentId: AGENT }),
    toolResult(TASK_CALL, 'The key is in .env.'),
  ]);

  const built = report(model);
  assert.equal(built.tally.filesReached, 1);
  assert.equal(eventOf(model, CALL).agentId, AGENT);
  assert.equal(built.delegations.length, 1);
  assertNothingLeaks(built);
});

test('a check that stopped a read is said as stopped, never as a rule having held (WS9)', async (t) => {
  const model = await read(t, [...call(CALL, 'bash', { command: 'cat .env' }), toolRefused(CALL, 'check')]);

  const built = report(model);
  assert.equal(built.tally.refusedAttempts, 1);
  assert.deepEqual(built.tally.refusedByOthers, { reviewer: 0, person: 0, check: 1 });
  assertNothingLeaks(built);
});

test('a loop that prints files it does not name leaves an access gap, never a call that reached nothing (SK1)', async (t) => {
  const model = await read(t, [
    ...call(CALL, 'bash', { command: 'for f in $(find . -name "*.md"); do cat "$f"; done' }),
    toolResult(CALL, '# notes\nsome text\n<shellId: 5 completed with exit code 0>', { exitCode: 0 }),
  ]);

  assert.ok(model.gaps.some((gap) => gap.kind === 'capability-absent' && gap.question === 'access' && gap.eventId === CALL));
});


// Plan step 7's acceptance: an edit of a private file is a write of that file, and what it wrote is no output.
test('an edit of a private file is a write of it', async (t) => {
  const model = await read(t, [...call(CALL, 'edit', { path: `${PROJECT}/.env`, old_str: 'API_KEY=old', new_str: `API_KEY=${SECRET}` }), toolResult(CALL, 'File edited.')]);

  const built = report(model);
  assert.ok(built.fileSteps?.some((step) => String(step.path).endsWith('.env') && step.how === 'changed'), 'the file is changed, not read');
  assertNothingLeaks(built);
});

// CPB58, from the maintainer's test round of 2026-10-12: a tool that ran and failed is no refusal, and its failure
// establishes nothing of what it reached (X11) - never a read, never a stop, never a marker no one measured.
test('a call that ran and failed is a failed run: no refusal, no read, no unrecognised marker (CPB58)', async (t) => {
  const model = await read(t, [
    ...call(CALL, 'view', { path: `${PROJECT}/.env.missing` }),
    { type: 'tool.execution_complete', data: { toolCallId: CALL, success: false, error: { code: 'failure', message: 'Path does not exist' } } },
  ]);

  const event = eventOf(model, CALL);
  assert.deepEqual([event.outcome, event.execution, event.result?.refusedBy, event.result?.content], ['unknown', { status: 'failed' }, undefined, 'Path does not exist']);
  assert.equal(model.gaps.some((gap) => gap.kind === 'outcome-unrecognised'), false);
});

// `copilot-blocks-too` §2a, the CLI 1.0.95 with GPT-5 mini: the search tool called `grep`, a flag as a key of its own, a
// search by the runtime's own subagent, and a hook that errored.
test('grep is the search tool by another name, and an errored hook is a check (CPB60, CPB61)', async (t) => {
  const model = await read(t, [
    ...call('call_GREP', 'grep', { pattern: 'API_KEY', paths: PROJECT, glob: '*.env', output_mode: 'content', '-n': true }), toolResult('call_GREP', '.env:1:API_KEY=x'),
    ...call('call_ERR', 'view', { path: `${PROJECT}/README.md` }),
    { type: 'tool.execution_complete', data: { toolCallId: 'call_ERR', success: false, error: { code: 'denied', message: 'Denied by preToolUse hook from "/Users/someone/.copilot/hooks/agentwhy.json" (hook errored)' } } },
  ]);

  const grep = eventOf(model, 'call_GREP');
  assert.deepEqual([grep.toolKnown, grep.targets, grep.resultShape, grep.printsMatches], [true, [PROJECT], 'listing', true]);
  const errored = eventOf(model, 'call_ERR');
  assert.deepEqual([errored.outcome, errored.result?.refusedBy], ['blocked', 'check']);
  assert.equal(model.gaps.some((gap) => gap.kind === 'outcome-unrecognised'), false);
});

// CPB62, `copilot-blocks-too` §2a e1: search_code_subagent hands a search to a subagent of the runtime's own, which
// works with VS Code's names - grep_search over the whole project, file_search for names, read_file for a file's lines.
test("search_code_subagent is a delegation, and its subagent's read_file and grep_search are a read and a search", async (t) => {
  const by = { agentId: AGENT, taskCall: 'call_SCS' };
  const model = await read(t, [
    ...call('call_SCS', 'search_code_subagent', { query: 'API_KEY', details: 'find where keys are set', thoroughness: 'deep' }),
    { type: 'subagent.started', agentId: AGENT, data: { toolCallId: 'call_SCS', agentName: 'search-subagent', agentType: 'search-subagent' } },
    toolStart('call_GS', 'grep_search', { query: 'API_KEY', isRegexp: false, includePattern: '**/*' }, by),
    toolResult('call_GS', `${PROJECT}/.env:1:API_KEY=${SECRET}`, { agentId: AGENT }),
    toolStart('call_RF', 'read_file', { filePath: `${PROJECT}/.env`, startLine: 1, endLine: 5 }, by),
    toolResult('call_RF', `API_KEY=${SECRET}`, { agentId: AGENT }),
    toolStart('call_FS', 'file_search', { query: '**/.env*' }, by), toolResult('call_FS', `${PROJECT}/.env`, { agentId: AGENT }),
    toolResult('call_SCS', 'API_KEY is set in .env.'),
  ]);

  const [delegation] = model.delegations;
  assert.deepEqual([delegation?.childAgentId, delegation?.requestedType, delegation?.prompt], [AGENT, 'search-subagent', 'API_KEY']);
  const readFile = eventOf(model, 'call_RF');
  assert.deepEqual([readFile.toolKnown, readFile.targets, readFile.resultShape, readFile.agentId], [true, [`${PROJECT}/.env`], 'content', AGENT]);
  assert.deepEqual([eventOf(model, 'call_GS').resultShape, eventOf(model, 'call_GS').printsMatches], ['listing', true]);
  assert.equal(eventOf(model, 'call_FS').printsMatches, undefined);
  assert.equal(model.gaps.filter((gap) => gap.kind === 'relation-unresolved').length, 0);
  const built = report(model);
  assert.equal(built.tally.filesReached, 1);
  assertNothingLeaks(built);
});

