// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { recogniseCopilot } from '../../../../src/adapter/copilot/discovery/copilot-recognition.ts';
import { CopilotSessionSource } from '../../../../src/adapter/copilot/events/copilot-session-source.ts';
import type { CopilotDoctorReport } from '../../../../src/adapter/copilot/probe/copilot-doctor-report.ts';
import { CopilotProbe } from '../../../../src/adapter/copilot/probe/copilot-probe.ts';
import { SessionFormats } from '../../../../src/core/session-format.ts';
import { CopilotDoctor } from '../../../../src/doctor/copilot-doctor.ts';
import type { DoctorUseCase } from '../../../../src/doctor/doctor-use-case.ts';
import { FormatSelectingDoctor } from '../../../../src/doctor/format-selecting-doctor.ts';
import { CopilotTextDoctorRenderer } from '../../../../src/doctor/render/copilot-text-doctor-renderer.ts';
import { JsonDoctorRenderer } from '../../../../src/doctor/render/json-doctor-renderer.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { refusalReason } from '../../../../src/refuse/render/refusal-words.ts';
import { CANARY, writeSession } from '../../../helpers/synthetic-session.ts';
import {
  AGENT, CALL, FORK, PROJECT, REQUEST, SECOND_CALL, SESSION, TASK_CALL, assistantMessage, editorStart, hookEnd, hookStart,
  modelMessage, permissionCompleted, permissionRequested, records, sessionStart, spilledResult, subagentStarted, toolRefused,
  toolResult, toolStart, userMessage, workspaceYaml, type Draft,
} from '../../../helpers/copilot-session.ts';

const files = new NodeFileSystem();
const probe = new CopilotProbe({ directories: files, files });
const OTHER = 'b2c3d4e5-0000-4000-8000-000000000000';
const STRAY = 'c3d4e5f6-0000-4000-8000-000000000000';
const EMPTY = 'd4e5f6a7-0000-4000-8000-000000000000';
const by = { agentId: AGENT, taskCall: TASK_CALL };
const refused = (callId: string, message: string): Draft => ({ type: 'tool.execution_complete', data: { toolCallId: callId, success: false, error: { code: 'denied', message } } });

/** A session of every kind of record and join, a fork, a VS Code transcript, a folder with no file, one with no message. */
function corpus(): Record<string, string> {
  const main = records(SESSION,
    sessionStart(SESSION), userMessage(), assistantMessage(CANARY),
    toolStart(CALL, 'bash', { command: `cat ${CANARY}` }), toolResult(CALL, `${CANARY}\n<shellId: 1 completed with exit code 0>`, { exitCode: 0 }),
    toolStart('call_SPILL', 'bash', { command: 'ls -R' }), spilledResult('call_SPILL'),
    toolStart('call_RULE', 'bash', { command: CANARY }), toolRefused('call_RULE', 'rule'),
    toolStart('call_CHECK', 'bash', { command: CANARY }), toolRefused('call_CHECK', 'check'),
    toolStart('call_OURS', 'bash', { command: 'cat .env' }), refused('call_OURS', `Denied by preToolUse hook: ${refusalReason(`${PROJECT}/.env`, '**/.env', 0, { kind: 'named' })}`),
    toolStart('call_ODD', 'bash', { command: CANARY }), toolRefused('call_ODD', 'unknown'),
    toolStart('call_ASKED', 'bash', { command: CANARY }), permissionRequested(REQUEST, 'call_ASKED'), permissionCompleted(REQUEST, 'call_ASKED'),
    toolStart('call_HANGING', 'view', { path: CANARY }),
    toolStart('call_FAILED', 'view', { path: CANARY }),
    { type: 'tool.execution_complete', data: { toolCallId: 'call_FAILED', success: false, error: { code: 'failure', message: CANARY } } },
    toolStart(TASK_CALL, 'task', { prompt: CANARY, mode: 'background' }), subagentStarted(AGENT, TASK_CALL),
    toolResult(TASK_CALL, `Agent started in background with agent_id: ${AGENT}.`),
    toolStart(SECOND_CALL, 'view', { path: CANARY }, by), toolResult(SECOND_CALL, CANARY, { agentId: AGENT }),
    toolStart('call_STRAY', 'view', { path: CANARY }, { agentId: CANARY, taskCall: CANARY }),
    toolStart('call_READ', 'read_agent', { agent_id: AGENT, since_turn: 0 }), toolResult('call_READ', CANARY),
    { type: 'tool.execution_start', data: { toolCallId: 'call_MCP', toolName: CANARY, mcpServerName: 'github-mcp-server', arguments: {} } },
    toolStart('call_NEW', CANARY, { path: CANARY }),
    toolResult('call_NOWHERE', CANARY),
    hookStart('preToolUse', { toolCalls: [{ id: CALL, args: { command: CANARY } }] }), hookEnd('preToolUse'),
    { type: 'hook.start', data: { hookInvocationId: CANARY, hookType: CANARY, input: {} } },
    modelMessage(), { type: `${CANARY}.type`, data: { content: CANARY } },
  ).trimEnd().split('\n');
  // A key at a record's own level no measurement has seen.
  const withKey = JSON.stringify({ ...JSON.parse(main[1] as string), [CANARY]: CANARY });
  const copied = [userMessage(), toolStart('call_P', 'view', { path: 'a' }), toolResult('call_P', 'a')];
  const parent = records(OTHER, sessionStart(OTHER, { copilotVersion: '1.0.96' }), ...copied);
  // CPB36: a fork's first lines are its parent's, ids and all - its session.start too, carrying the fork's own id.
  const forked = records(OTHER, sessionStart(FORK, { copilotVersion: '1.0.96' }), ...copied);
  return {
    [`${SESSION}/events.jsonl`]: [main[0], withKey, ...main.slice(2)].join('\n') + '\n',
    [`${SESSION}/workspace.yaml`]: workspaceYaml({ id: SESSION, cwd: `/Users/someone/${CANARY}`, client: 'github/autopilot' }),
    [`${OTHER}/events.jsonl`]: parent,
    [`${OTHER}/workspace.yaml`]: workspaceYaml({ id: OTHER, cwd: PROJECT, forkCount: 1, client: CANARY }),
    [`${FORK}/events.jsonl`]: forked + records(FORK, toolStart('call_F', 'view', { path: 'b' }), toolResult('call_F', 'b')),
    [`${FORK}/workspace.yaml`]: workspaceYaml({ id: FORK, cwd: PROJECT }),
    [`${STRAY}/events.jsonl`]: records(STRAY, editorStart(STRAY), userMessage()),
    [`${EMPTY}/events.jsonl`]: records(EMPTY, sessionStart(EMPTY, { copilotVersion: CANARY })),
    [`${CANARY}/workspace.yaml`]: workspaceYaml({ id: CANARY, cwd: PROJECT }),
  };
}

test('the Copilot report counts every kind and join with fixed labels, and names no value, key, id or path it read', async (t) => {
  const root = await writeSession(t, corpus());
  const report = await probe.probe(root);

  assert.deepEqual(report.files, { found: 6, recognised: 4, unknownFormat: 1, noEvents: 1, noMessage: 1, unreadable: 0 });
  assert.deepEqual(report.versions, { '1.0.94': 1, '1.0.x': 2, '<unknown>': 1 });
  assert.deepEqual(report.clients, { '(none)': 1, '<unknown>': 1, 'github/autopilot': 1, 'github/cli': 1 });
  assert.deepEqual(report.identity, { folderDisagrees: 0, projectDisagrees: 1, forkParents: 1, linesFromParent: 4 });
  assert.equal(report.recordTypes['<unknown>'], 1);
  assert.deepEqual(report.recordKeys, { '<unknown>': 1 });
  assert.deepEqual(report.tools, { '<unknown>': 1, bash: 7, mcp: 1, read_agent: 1, task: 1, view: 6 });
  assert.deepEqual(report.calls, { started: 17, completed: 12, stoppedByPerson: 1, withoutOutcome: 4, completionsWithoutStart: 1 });
  assert.deepEqual(report.results, { 'bash exit code': 2, failed: 1, 'launch notice': 1, spilled: 1 }, 'a tool that failed is no stop (CPB58)');
  assert.deepEqual(report.refusals, { '<unknown>': 1, agentwhy: 1, check: 1, person: 1, rule: 1 });
  assert.deepEqual(report.delegations, { started: 1, joinedToTask: 1, callsJoined: 1, callsUnjoined: 1, readAgentJoined: 1, readAgentUnjoined: 0 });
  assert.deepEqual(report.hooks, { joined: 1, startsWithoutEnd: 1, endsWithoutStart: 0 });
  assert.equal(report.capabilities['actions unmeasured'], 2, 'the file of unknown shapes and the build of another line');

  for (const output of [new CopilotTextDoctorRenderer().render(report), new JsonDoctorRenderer<CopilotDoctorReport>().render(report)]) {
    assert.ok(!output.includes(CANARY), 'no value, key or path a record held is printed');
    assert.ok(!output.includes(root));
    for (const id of [SESSION, OTHER, FORK, STRAY, AGENT, CALL, TASK_CALL]) assert.ok(!output.includes(id), 'no id is printed');
  }
});

test('the Copilot report is a closed schema: its keys are exactly these, its labels fixed words', async (t) => {
  const report = await probe.probe(await writeSession(t, corpus()));
  assert.deepEqual(Object.keys(report), [
    'schemaVersion', 'provider', 'contractVersion', 'verifiedAgainst', 'files', 'lines', 'versions', 'clients', 'identity',
    'recordTypes', 'recordKeys', 'tools', 'calls', 'results', 'refusals', 'delegations', 'hooks', 'capabilities',
  ]);
  const labels = Object.values(report).filter((value) => typeof value === 'object' && value !== null && !Array.isArray(value))
    .flatMap((group) => Object.keys(group as Record<string, unknown>));
  for (const label of labels) assert.match(label, /^(?:<unknown>|\(none\)|[A-Za-z0-9_./-]+)(?: [A-Za-z0-9_<>.()-]+)*$/, label);
});

test('a file given by name and a session folder are measured alike; anything else is no Copilot session', async (t) => {
  const root = await writeSession(t, corpus());
  const byFile = await probe.probe(join(root, OTHER, 'events.jsonl'));
  const byFolder = await probe.probe(join(root, OTHER));
  assert.deepEqual(byFile.calls, byFolder.calls);
  assert.equal(byFolder.files.found, 1);

  const doctor = new CopilotDoctor({ probe, renderers: { text: new CopilotTextDoctorRenderer(), json: new JsonDoctorRenderer<CopilotDoctorReport>() } });
  assert.equal((await doctor.run({ input: join(root, OTHER), format: 'text' })).outcome, 'complete');
  assert.equal((await doctor.run({ input: join(root, STRAY), format: 'json' })).outcome, 'unknown-format');
  assert.equal((await doctor.run({ input: join(root, 'nothing'), format: 'text' })).outcome, 'unknown-format');
});

// Plan step 5: every format selects by content, Copilot's among them, and its diagnosis answers for its own input alone.
test('with Copilot registered, doctor tells three formats apart by content', async (t) => {
  const root = await writeSession(t, corpus());
  const named = (name: string): DoctorUseCase => ({ run: async () => ({ outcome: 'complete', output: name }) });
  const doctor = new FormatSelectingDoctor({
    formats: new SessionFormats([
      { provider: 'codex', recognise: async () => 'unknown' },
      { provider: 'copilot', recognise: (input) => recogniseCopilot(files, files, input) },
      { provider: 'claude-code', recognise: async () => 'unknown' },
    ]),
    doctors: { codex: named('codex'), 'claude-code': named('claude-code'), copilot: new CopilotDoctor({ probe, renderers: { text: new CopilotTextDoctorRenderer(), json: new JsonDoctorRenderer<CopilotDoctorReport>() } }) },
    whenUnavailable: 'claude-code',
  });

  assert.match((await doctor.run({ input: join(root, SESSION), format: 'text' })).output, /^agentwhy doctor · Copilot/);
  assert.equal(JSON.parse((await doctor.run({ input: join(root, OTHER, 'events.jsonl'), format: 'json' })).output).provider, 'copilot');
  assert.equal((await doctor.run({ input: join(root, STRAY), format: 'text' })).outcome, 'unknown-format', "VS Code's transcript is no runtime session (CP1a)");
});

// Two paths over one file must agree (conventions, "a differential invariant"): what `doctor` says a file can answer is
// what a report read from it says.
test('the probe and the reader say the same of what a file can answer', async (t) => {
  const reader = new CopilotSessionSource({ directories: files, files });
  const cases: Record<string, readonly Draft[]> = {
    measured: [sessionStart(SESSION), userMessage()],
    'another build of the line': [sessionStart(SESSION, { copilotVersion: '1.0.99' })],
    'another line': [sessionStart(SESSION, { copilotVersion: '1.1.0' })],
    'an unknown type': [sessionStart(SESSION), { type: `${CANARY}.type`, data: {} }],
  };
  for (const [name, drafts] of Object.entries(cases)) {
    const root = await writeSession(t, { [`${SESSION}/events.jsonl`]: records(SESSION, ...drafts) });
    const model = await reader.read(join(root, SESSION));
    const read = [...new Set(model.gaps.flatMap((gap) => (gap.question === undefined ? [] : [`${gap.question} ${gap.kind.replace('capability-', '')}`])))].sort();
    const probed = Object.keys((await probe.probe(join(root, SESSION))).capabilities).filter((key) => !key.endsWith(' supported')).sort();
    assert.deepEqual(probed, read, name);
  }
});
