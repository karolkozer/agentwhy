// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { CodexSessionDiscovery } from '../../../../src/adapter/codex/discovery/codex-session-discovery.ts';
import { CodexSessionSource } from '../../../../src/adapter/codex/events/codex-session-source.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { buildReport } from '../../../../src/report/build-report.ts';
import type { ReportModel } from '../../../../src/report/report-model.ts';
import { ReportPageRenderer } from '../../../../src/report/render/report-page/report-page-renderer.ts';
import { TextReportRenderer } from '../../../../src/report/render/text-report-renderer.ts';
import {
  activity, agentItem, agentMessage, CHILD, cell, cellOutput, command, fileChange, functionCall, functionOutput, given, item,
  LATER_TURN, meta, REVIEW_TURN, REVIEWER, reviewerMeta, ROOT, reasoning, rolloutPath, said, SECOND_CHILD, spawnedMeta,
  taskComplete, taskStarted, TURN, turnContext, CHILD_TURN,
} from '../../../helpers/codex-session.ts';
import { refusalReason } from '../../../../src/refuse/render/refusal-words.ts';
import { FaultyFileSystem } from '../../../helpers/faulty-file-system.ts';
import { CANARY, jsonl, writeSession } from '../../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
// The value is invented, and assembled at run time so no source file holds it whole.
const SECRET = ['canary', 'orchid', '4821', CANARY].join('-');
const ENV = `PROJECT_TOKEN=${SECRET}\nDEBUG=true\n`;

async function read(t: TestContext, rollouts: Readonly<Record<string, readonly object[]>>, input = rolloutPath(ROOT)): Promise<SessionModel> {
  const root = await writeSession(t, Object.fromEntries(Object.entries(rollouts).map(([path, lines]) => [path, jsonl(...lines)])));
  const source = new CodexSessionSource({ discovery: new CodexSessionDiscovery({ directories: files, files }), files, sessionsRoot: root });
  return source.read(join(root, input));
}

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

const gapsOf = (model: SessionModel) => model.gaps.map((gap) => gap.kind + (gap.question === undefined ? '' : `:${gap.question}`));

test('a paginated root: one event per action item, commands read only from a known shell shape, the cell as context', async (t) => {
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT), turnContext(TURN),
    given('user', `Please look ${CANARY}`),
    cell('call_a', `await tools.exec_command({ cmd: "cat .env" }) // ${CANARY}`),
    item(ROOT, command('exec_a', 'cat .env', ENV)),
    // X7: four elements is no command line; the whole array stays input and the tool is unknown.
    item(ROOT, { ...command('exec_b', 'cat .env', ENV), command: ['zsh', '-lc', 'cat .env', CANARY] }),
    item(ROOT, fileChange('exec_c', { 'notes.md': { type: 'add', content: `hello ${CANARY}` } })),
    item(ROOT, { type: 'McpToolCall', id: 'call_m', server: CANARY, tool: CANARY, arguments: { q: CANARY }, result: { content: [{ type: 'text', text: CANARY }] }, status: 'completed' }),
    item(ROOT, { type: 'WebSearch', id: 'exec_w', action: { type: 'search', query: CANARY }, results: [{ title: CANARY }] }),
    cellOutput('call_a', ENV),
    said('msg_1', 'final_answer', 'Done.'),
  ] });

  assert.deepEqual(model.events.map((event) => [event.id, event.toolName, event.toolKnown, event.commands, event.outcome]), [
    ['exec_a', 'zsh', true, ['cat .env'], 'succeeded'],
    ['exec_b', 'CommandExecution', false, [], 'unknown'],
    ['exec_c', 'FileChange', true, [], 'succeeded'],
    ['call_m', 'McpToolCall', false, [], 'unknown'],
    ['exec_w', 'WebSearch', false, [], 'unknown'],
  ]);
  assert.deepEqual(model.events.map((event) => event.sequence), [1, 2, 3, 4, 5]);
  assert.equal(model.events[0]?.result?.stage, 'model', 'XB5: this cell returned what the process printed, whole and alone, so it is what the model was handed');
  assert.equal(model.events[0]?.result?.completeness, 'unknown', 'and no output is assumed whole (§2.8)');
  assert.equal(model.events[0]?.turnId, TURN);
  assert.ok(!JSON.stringify(model.events).includes('parsed/by/codex'), 'X8: parsed_cmd is never read');
  assert.deepEqual(model.contexts.map((context) => [context.kind, context.author]), [['conversation', 'person'], ['code', 'agent']]);
  assert.deepEqual(model.deliveries.map((delivery) => [delivery.recipientAgentId, delivery.sourceId, delivery.status]), [[ROOT, undefined, 'confirmed']]);
  assert.deepEqual(model.turns.map((turn) => [turn.id, turn.agentId, turn.permissions?.approver, turn.permissions?.scopes.length, turn.permissions?.complete]), [[TURN, ROOT, 'person', 2, true]]);
  assert.equal(model.projectRoot.kind, 'known');

  const built = report(model);
  assert.equal(built.tally.filesReached, 1);
  assert.equal(built.tally.contentsSeen, 1, 'the cell handed the file to the model');
  // X7: a line not read names no target, so it is no attempt at a protected file - and what it did is a gap, not nothing.
  assert.equal(built.tally.unknownAttempts, 0);
  assert.ok(gapsOf(model).includes('capability-absent:access'));
  assertNothingLeaks(built);
});

test('X11: a failed cat of a missing file reaches nothing, and exit 0 of an unprofiled command confirms nothing', async (t) => {
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT), turnContext(TURN),
    item(ROOT, command('exec_a', 'cat .env', 'cat: .env: No such file or directory\n', 'failed', 1)),
    item(ROOT, command('exec_b', 'python3 show.py .env.local', ENV)),
  ] });
  const built = report(model);

  assert.deepEqual(model.events.map((event) => [event.outcome, event.execution?.status, event.execution?.exitCode]), [['unknown', 'failed', 1], ['unknown', 'completed', 0]]);
  assert.equal(built.tally.filesReached, 0);
  assert.equal(built.tally.contentsSeen, 0);
  assert.equal(built.tally.unknownAttempts, 2);
  assert.equal(built.headline.severity, 'attention');
});

// X7: a read line is named by the listed shell that ran it, as Claude Code's is by `Bash`; any other shape keeps the type.
test('a command is named by the shell the record says ran it, never by its item type', async (t) => {
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT), turnContext(TURN),
    item(ROOT, command('exec_a', 'cat .env', ENV)),
    item(ROOT, { ...command('exec_b', 'cat .env', ENV), command: ['/bin/bash', '-c', 'cat .env.local'] }),
    item(ROOT, { ...command('exec_c', 'cat .env', ENV), command: [`/opt/${CANARY}`, '-lc', 'cat .env'] }),
  ] });

  assert.deepEqual(model.events.map((event) => [event.id, event.toolName, event.toolKnown]), [
    ['exec_a', 'zsh', true], ['exec_b', 'bash', true], ['exec_c', 'CommandExecution', false],
  ]);
  const built = report(model);
  assert.deepEqual([...new Set(built.stories.map((story) => story.did.toString()))].sort(), ['bash (cat)', 'zsh (cat)']);
  assertNothingLeaks(built);
});

test('X10, X14: a value in a nested result that the cell forwards only as a count is found, and nobody saw it', async (t) => {
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT), turnContext(TURN),
    cell('call_a', 'const r = await tools.exec_command({ cmd: "cat .env" }); text(r.output.length)'),
    item(ROOT, command('exec_a', 'cat .env', ENV)),
    cellOutput('call_a', '33'),
  ] });
  const built = report(model);

  assert.equal(built.tally.filesReached, 1);
  assert.equal(built.privateFiles[0]?.names.length, 2, 'what the file holds is still read, by name');
  assert.equal(built.tally.contentsSeen, 0);
  assertNothingLeaks(built);
});

// XB5, measured 2026-10-05 over the 79 non-empty command outputs of Codex 0.160.0 `paginated`: 15 reached a cell whole,
// 36 left one long line of themselves in it, 11 only a first token and 17 nothing - the agent's own JavaScript stands
// between the process and the model. So a command's output is the model's only where one cell is shown to have carried
// it whole, and a text two cells returned belongs to neither; no id joins an item to a cell (§2.3).
test('XB5: the output one cell returned whole is the model’s; one no cell returned, or two did, is not', async (t) => {
  const shared = 'ROWS=2';
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT), turnContext(TURN),
    cell('call_a', 'await tools.exec_command({ cmd: "cat .env" })'),
    item(ROOT, command('exec_a', 'cat .env', ENV)),
    cellOutput('call_a', `the file says:\n${ENV}`),
    cell('call_b', 'await tools.exec_command({ cmd: "cat other.env" })'),
    item(ROOT, command('exec_b', 'cat other.env', 'DEBUG=false\n')),
    cellOutput('call_b', 'kept it to myself'),
    cell('call_c', 'await tools.exec_command({ cmd: "head -1 rows.csv" })'),
    item(ROOT, command('exec_c', 'head -1 rows.csv', shared)),
    cellOutput('call_c', shared),
    cell('call_d', 'await tools.exec_command({ cmd: "tail -1 rows.csv" })'),
    item(ROOT, command('exec_d', 'tail -1 rows.csv', shared)),
    cellOutput('call_d', shared),
    cell('call_e', 'await tools.exec_command({ cmd: "cat empty.txt" })'),
    item(ROOT, command('exec_e', 'cat empty.txt', '')),
    cellOutput('call_e', 'said nothing'),
  ] });

  assert.deepEqual(model.events.map((event) => [event.id, event.result?.stage]), [
    ['exec_a', 'model'],
    ['exec_b', 'execution'],
    ['exec_c', 'execution'],
    ['exec_d', 'execution'],
    ['exec_e', 'execution'],
  ], 'whole and alone is the model’s; absent is not, a text two cells hold names neither, and no cell is shown to carry nothing');
  assertNothingLeaks(report(model));
});

test('X9: a failed change keeps its targets and writes nothing; a completed one writes its added lines, never removed ones', async (t) => {
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT), turnContext(TURN),
    item(ROOT, fileChange('exec_f', { 'config.ts': { type: 'add', content: `const token = "${SECRET}";` } }, 'failed')),
    item(ROOT, fileChange('exec_u', { 'app.ts': { type: 'update', unified_diff: `@@\n-const old = "${SECRET}";\n+const next = 1;`, move_path: 'src/app.ts' } })),
    item(ROOT, fileChange('exec_d', { 'old.ts': { type: 'delete' }, 'odd.ts': { type: CANARY } })),
  ] });

  assert.deepEqual(model.events.map((event) => [event.outcome, event.targets, event.written]), [
    ['unknown', ['config.ts'], undefined],
    ['succeeded', ['app.ts', 'src/app.ts'], ['const next = 1;']],
    ['succeeded', ['old.ts', 'odd.ts'], []],
  ]);
  assert.deepEqual(gapsOf(model).filter((gap) => gap === 'capability-absent:access'), ['capability-absent:access', 'capability-absent:access'],
    'the failed change and the change of an unread kind each leave the effect unanswered');
});

test('X13, X3, X24: copies under compacted count for nothing, a later session_meta changes nothing, unknowns are gaps', async (t) => {
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT), meta(SECOND_CHILD),
    { type: 'compacted', payload: { replacement_history: [cell('call_x', CANARY).payload, command('exec_x', 'cat .env', ENV)] } },
    item(ROOT, { type: `${CANARY}Item`, id: 'exec_u', status: 'completed' }),
    item(ROOT, { ...command('exec_s', 'cat .env', ENV), status: CANARY }),
    { type: CANARY, payload: { type: CANARY } },
  ] });

  assert.equal(model.sessionId, ROOT);
  assert.deepEqual(model.events.map((event) => [event.id, event.toolName, event.outcome]), [
    ['exec_u', 'unrecognised action', 'unknown'], ['exec_s', 'zsh', 'unknown'],
  ]);
  assert.ok(gapsOf(model).includes('outcome-unrecognised'), 'an unknown status is unrecognised');
  assert.ok(gapsOf(model).includes('capability-unmeasured:actions'), 'an unknown item and line leave the action stream unmeasured');
  assertNothingLeaks(report(model));
});

test('X16, X17, X18: a spawn, two follow-ups and two reports make one helper, and a stray message joins nothing', async (t) => {
  const helper = '/root/helper';
  const model = await read(t, {
    [rolloutPath(ROOT)]: [
      meta(ROOT, { agent_path: '/root' }), turnContext(TURN),
      functionCall('call_spawn', 'spawn_agent', { task_name: 'check', message: `Check the config ${CANARY}` }),
      functionOutput('call_spawn', `started ${CANARY}`),
      item(ROOT, activity('call_spawn', 'started', CHILD, helper)),
      functionCall('call_more', 'send_message', { target: helper, message: `Use ${SECRET} to sign in` }),
      item(ROOT, activity('call_more', 'interacted', CHILD, helper)),
      functionCall('call_again', 'followup_task', { target: helper, message: 'and the tests' }),
      item(ROOT, activity('call_again', 'interacted', CHILD, helper)),
      // Names a thread its caller never started: no follow-up, kept as words, with a gap.
      functionCall('call_stray', 'send_message', { target: '/root/other', message: CANARY }),
      item(ROOT, activity('call_stray', 'interacted', SECOND_CHILD, '/root/other')),
      item(ROOT, activity('subagent_done', 'completed', CHILD, helper)),
      agentMessage(helper, '/root', `Done, ${CANARY}`),
      agentMessage(helper, '/root', 'Second report'),
    ],
    [rolloutPath(CHILD, '30')]: [
      spawnedMeta(CHILD, ROOT, helper), turnContext(CHILD_TURN),
      agentMessage('/root', helper, `Check the config ${CANARY}`),
      said('msg_c', 'final_answer', 'Looked.', CHILD_TURN),
    ],
  });

  assert.deepEqual(model.agents.map((agent) => [agent.id, agent.type, agent.depth]), [[ROOT, 'main', 0], [CHILD, 'subagent', 1]]);
  assert.equal(model.delegations.length, 1, 'one helper, one delegation');
  const [delegation] = model.delegations;
  assert.equal(delegation?.childAgentId, CHILD);
  assert.equal(delegation?.depth, 1);
  assert.deepEqual(delegation?.followUps.map((followUp) => followUp.id), ['call_more', 'call_again'], 'in the order read');
  assert.deepEqual(delegation?.reports.map((each) => each.content.startsWith('Done') || each.content === 'Second report'), [true, true]);
  assert.deepEqual(model.contexts.filter((context) => context.kind === 'unjoined-instruction').map((context) => context.agentId), [ROOT]);
  assert.deepEqual(model.contexts.filter((context) => context.author === 'another-agent').map((context) => context.agentId), [CHILD],
    "in the helper's file, the parent's words are the parent's, never the helper's own");

  const built = report(model);
  assert.equal(built.delegations.length, 1);
  assertNothingLeaks(built);
});

test('X16, X18: a broken activity leaves the delegation unresolved, and a name two helpers share joins no report', async (t) => {
  const shared = '/root/twin';
  const model = await read(t, {
    [rolloutPath(ROOT)]: [
      meta(ROOT), turnContext(TURN),
      functionCall('call_one', 'spawn_agent', { task_name: 'one', message: 'one' }),
      item(ROOT, activity('call_one', 'started', CHILD, shared)),
      functionCall('call_two', 'spawn_agent', { task_name: 'two', message: 'two' }),
      // Its activity names no call of this file.
      item(ROOT, activity('call_elsewhere', 'started', SECOND_CHILD, shared)),
      agentMessage(shared, '/root', CANARY),
    ],
    [rolloutPath(CHILD)]: [spawnedMeta(CHILD, ROOT, shared)],
    [rolloutPath(SECOND_CHILD)]: [spawnedMeta(SECOND_CHILD, ROOT, shared)],
  });

  assert.deepEqual(model.delegations.map((delegation) => [delegation.id, delegation.childAgentId, delegation.completeness]), [
    ['call_one', CHILD, 'complete'], ['call_two', undefined, 'unresolved'],
  ]);
  assert.deepEqual(model.delegations.flatMap((delegation) => delegation.reports), [], 'a name two helpers share names neither');
  assert.ok(model.contexts.some((context) => context.author === 'another-agent' && context.agentId === ROOT));
  assert.equal(model.completeness, 'unresolved');
});

test('X19, X20: a reviewer is a review of a turn, never an agent; several verdicts keep their own evidence', async (t) => {
  const model = await read(t, {
    [rolloutPath(ROOT)]: [meta(ROOT), turnContext(TURN), turnContext(LATER_TURN), item(ROOT, command('exec_a', 'ls', 'a\nb\n'))],
    [rolloutPath(REVIEWER)]: [
      reviewerMeta(REVIEWER, ROOT),
      taskStarted(REVIEW_TURN, TURN),
      given('user', `Review this action ${CANARY}`, REVIEW_TURN),
      said('msg_r', 'final_answer', CANARY, REVIEW_TURN),
      taskComplete(REVIEW_TURN, JSON.stringify({ outcome: 'allow', risk_level: 'low', user_authorization: 'high', rationale: CANARY })),
      taskStarted('turn-r2', LATER_TURN),
      taskComplete('turn-r2', JSON.stringify({ outcome: CANARY, risk_level: 'medium', rationale: CANARY })),
      // A turn naming a turn its agent never had, and one naming none.
      taskStarted('turn-r3', 'not-a-turn'),
      taskComplete('turn-r3', JSON.stringify({ outcome: 'allow' })),
      taskComplete('turn-r4', JSON.stringify({ outcome: 'allow' })),
      item(REVIEWER, command('exec_r', 'cat .env', ENV), REVIEW_TURN),
    ],
  });

  assert.deepEqual(model.agents.map((agent) => agent.id), [ROOT], 'a reviewer is no agent of the delegation tree');
  assert.deepEqual(model.delegations, []);
  assert.deepEqual(model.events.map((event) => event.id), ['exec_a'], "a reviewer's own action is never its parent's");
  const [review] = model.reviews;
  assert.equal(review?.reviewedAgentId, ROOT);
  assert.deepEqual(review?.verdicts.map((verdict) => [verdict.outcome, verdict.turnId, verdict.risk]), [
    ['allowed', TURN, 'low'], ['unrecognised', LATER_TURN, 'medium'], ['allowed', undefined, undefined], ['allowed', undefined, undefined],
  ]);
  assert.ok(model.capabilities.some((capability) => capability.source.kind === 'review' && capability.question === 'actions' && capability.state === 'unmeasured'),
    'the reviewer ran something, which is unmeasured (XB9)');
  assert.ok(model.contexts.every((context) => context.author !== 'agent' || context.agentId !== REVIEWER), "a reviewer's words are never an agent's");
  assertNothingLeaks(report(model));
});

// XD4, amended 2026-10-05 by the maintainer (§2.11): a record that keeps no item of what ran - every VS Code panel
// record - reads the commands its cells wrote out as text. Its exit code is not recorded, so `cat` reaches nothing it can
// show; the format's own gaps stand, and the report is never clean.
test('X23, XD4: a record with no items reads its cells’ written commands, and is never a clean report', async (t) => {
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT, { history_mode: 'legacy', cli_version: '0.154.0-alpha.6.2' }),
    cell('call_a', 'await tools.exec_command({ cmd: "cat .env" })'),
    cellOutput('call_a', ENV),
    { type: 'event_msg', payload: { type: 'patch_apply_end', call_id: 'call_nowhere', stdout: CANARY } },
  ] });

  assert.deepEqual(model.events.map((event) => [event.toolName, event.outcome, event.commands, event.result?.stage]),
    [['exec_command', 'unknown', ['cat .env'], 'model']], 'the command as the code wrote it; what the cell returned is the model’s');
  assert.ok(gapsOf(model).includes('capability-absent:actions'));
  assert.ok(gapsOf(model).includes('capability-absent:access'));
  assert.ok(gapsOf(model).includes('capability-unmeasured:own-words'), 'an unmeasured build claims no message coverage');
  assert.notEqual(model.completeness, 'complete');
  const built = report(model);
  assert.equal(built.tally.contentsSeen, 0, 'no file was reached that the record shows');
  assert.ok(built.missing.some((line) => /the record does not show all of this: which actions ran/.test(line)));
  assertNothingLeaks(built);
});

// XD4 (§2.11), each cell one edge of the rule: a numbered search of one file whose hit came back is a read of it; one
// whose return is a diagnostic reads nothing; a cell of two commands returns no one command's text; a command the code
// builds while it runs is not read, and says so.
test('XD4: a numbered hit a cell returned is the file read, and nothing the record cannot back is', async (t) => {
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT, { history_mode: 'legacy', cli_version: '0.160.0' }), turnContext(TURN),
    cell('call_a', 'const r = await tools.exec_command({ cmd: "rg -n PROJECT_TOKEN .env" }); text(r.output)'),
    cellOutput('call_a', `1:PROJECT_TOKEN=${SECRET}`),
    cell('call_b', 'const r = await tools.exec_command({ cmd: "rg -n PROJECT_TOKEN .env.local" }); text(r.output)'),
    cellOutput('call_b', 'rg: .env.local: No such file or directory (os error 2)'),
    cell('call_c', 'await tools.exec_command({ cmd: "ls" }); text((await tools.exec_command({ cmd: "cat .env" })).output)'),
    cellOutput('call_c', ENV),
    cell('call_d', 'const f = ".env"; text((await tools.exec_command({ cmd: "cat " + f })).output)'),
    cellOutput('call_d', ENV),
  ] });

  assert.deepEqual(model.events.map((event) => [event.commands[0], event.outcome, event.result?.stage, event.result?.content === undefined]), [
    ['rg -n PROJECT_TOKEN .env', 'unknown', 'model', false],
    ['rg -n PROJECT_TOKEN .env.local', 'unknown', 'model', false],
    ['ls', 'unknown', 'model', true],
    ['cat .env', 'unknown', 'model', true],
  ], 'every command written as text, in order; a return given only to the one command of its cell');
  assert.ok(gapsOf(model).includes('capability-unmeasured:actions'), 'a command built at run time is not read, and is missing');

  const built = report(model);
  const reached = built.stories.map((story) => [story.path, story.outcome, story.read === true]);
  assert.deepEqual(reached.filter(([path]) => path === '.env'), [['.env', 'succeeded', true], ['.env', 'unknown', false]],
    'the hit it was handed is a read of .env; the cat beside ls is a name, its exit and its text not its own');
  assert.ok(!reached.some(([path, , read]) => path === '.env.local' && read), 'a diagnostic is no line of the file');
  assert.equal(built.tally.contentsSeen, 1);
  assertNothingLeaks(built);
});

// §2.8 run C, the shape an interrupted cell leaves: the first command's item, completed; the cell's own words; the second
// command failed with exit -1; `turn_aborted`, and no `task_complete`.
test('X14: an interrupted turn keeps what it recorded, and cannot say that was all it ran', async (t) => {
  const interrupted = [
    meta(ROOT), turnContext(TURN),
    cell('call_a', 'await tools.exec_command({ cmd: "cat .env" }); await tools.exec_command({ cmd: "sleep 90" })'),
    item(ROOT, command('exec_a', 'cat .env', ENV)),
    item(ROOT, command('exec_b', 'sleep 90', '', 'failed', -1)),
    cellOutput('call_a', 'aborted by user after 5.0s'),
    { type: 'event_msg', payload: { type: 'turn_aborted', turn_id: TURN, reason: 'interrupted' } },
    given('developer', '<turn_aborted>'),
  ];
  const model = await read(t, { [rolloutPath(ROOT)]: interrupted });
  const whole = await read(t, { [rolloutPath(ROOT)]: interrupted.filter((line) => (line as { payload?: { type?: string } }).payload?.type !== 'turn_aborted') });

  assert.ok(gapsOf(model).includes('capability-unmeasured:actions'), 'the interruption itself leaves the action stream unmeasured');
  assert.ok(!gapsOf(whole).includes('capability-unmeasured:actions'), 'and nothing else in the file does');
  const built = report(model);
  assert.equal(built.tally.filesReached, 1, 'the read recorded before it stopped still counts');
  assert.equal(built.tally.contentsSeen, 0, 'the cell handed back no value');
  assertNothingLeaks(built);
});

test('X31: one utterance per id with its copies, identical words under two ids stay two, and hidden reasoning is a gap', async (t) => {
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT), turnContext(TURN),
    item(ROOT, command('exec_a', 'cat .env', ENV)),
    said('msg_1', 'commentary', 'Checking now.'),
    item(ROOT, agentItem('msg_1', 'commentary', 'Checking now.')),
    said('msg_2', 'commentary', 'Checking now.'),
    reasoning('rs_1', []),
    item(ROOT, { type: 'Reasoning', id: 'rs_1', summary_text: [], raw_content: [] }),
    reasoning('rs_2', ['Looking at the config first.']),
    item(ROOT, { type: 'Reasoning', id: 'rs_2', summary_text: [], raw_content: [] }),
    said('msg_3', 'final_answer', `The token is ${SECRET}.`),
    item(ROOT, agentItem('msg_3', 'final_answer', `The token is ${SECRET}.`)),
    taskComplete(TURN, `The token is ${SECRET}.`),
    // A copy that joins nothing: kept and scanned, never a second utterance.
    item(ROOT, agentItem('msg_gone', 'commentary', CANARY)),
    given('user', `Is ${SECRET} right?`),
  ] });

  assert.deepEqual(model.messages.map((message) => [message.id, message.kind, message.channel, message.copies?.length ?? 0, message.completeness]), [
    ['msg_1', 'said', 'commentary', 1, 'complete'],
    ['msg_2', 'said', 'commentary', 0, 'complete'],
    ['rs_2', 'reasoning', undefined, 1, 'partial'],
    ['msg_3', 'said', 'final', 2, 'complete'],
  ]);
  assert.ok(gapsOf(model).includes('capability-absent:reasoning'));
  const built = report(model);
  assert.deepEqual(built.uses.map((use) => use.landed), ['said'], "the value is the agent's once, and the person's words are not its");
  assertNothingLeaks(built);
});

test('X31: a readable Reasoning item joined to hidden reasoning is that reasoning, partial, and joins with no gap', async (t) => {
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT), turnContext(TURN),
    reasoning('rs_1', []),
    item(ROOT, { type: 'Reasoning', id: 'rs_1', summary_text: ['Looking at the config first.'], raw_content: [] }),
    item(ROOT, { type: 'Reasoning', id: 'rs_1', summary_text: ['Looking at the config first.'], raw_content: [] }),
  ] });

  assert.deepEqual(model.messages.map((message) => [message.id, message.kind, message.completeness, message.copies?.length ?? 0]), [
    ['rs_1', 'reasoning', 'partial', 1],
  ]);
  assert.ok(!gapsOf(model).includes('relation-unresolved'), 'the id joins, so no join is said to have failed');
  assert.ok(gapsOf(model).includes('capability-absent:reasoning'), 'the encrypted rest is still unread');

  // A later item with the same id and other text is no copy: what only it holds is kept and scanned, with a gap.
  const differs = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT), turnContext(TURN), reasoning('rs_1', []),
    item(ROOT, { type: 'Reasoning', id: 'rs_1', summary_text: ['Looking.'], raw_content: [] }),
    item(ROOT, { type: 'Reasoning', id: 'rs_1', summary_text: [`Looking. The token is ${SECRET}.`], raw_content: [] }),
  ] });
  assert.deepEqual(differs.messages.map((message) => [message.id, message.copies?.length ?? 0]), [['rs_1', 0]]);
  assert.ok(differs.contexts.some((context) => context.author === 'agent' && context.text.includes(SECRET)), 'the second text is read');
  assert.ok(gapsOf(differs).includes('relation-unresolved'));
});

// §2.12, the shape all 84 measured had: a Stop hook's request as a `user` message, then a `HookPrompt` item with its id
// whose fragment's text that message holds, wrapped.
test('§2.12: a hook\'s request is no action: its HookPrompt is a copy of the message with its id, and one joining none is read', async (t) => {
  const request = 'The AI read customers.csv, a file you track. Tell the person in one sentence.';
  const hookPrompt = (id: string, text: string) => ({ type: 'HookPrompt', id, fragments: [{ hookRunId: 'stop:0:/hooks.json', text }] });
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT), turnContext(TURN),
    { type: 'response_item', payload: {
      type: 'message', role: 'user', id: 'hook_1', content: [{ type: 'input_text', text: `<hook_prompt hook_run_id="stop:0">${request}</hook_prompt>` }],
    } },
    item(ROOT, hookPrompt('hook_1', request)),
  ] });

  assert.ok(!gapsOf(model).includes('capability-unmeasured:actions'), 'a hook\'s request leaves the action stream as it was');
  assert.equal(model.events.length, 0, 'and is no action');
  assert.equal(model.contexts.filter((context) => context.text.includes(request)).length, 1, 'its words are read once, from the message');

  const alone = await read(t, { [rolloutPath(ROOT)]: [meta(ROOT), turnContext(TURN), item(ROOT, hookPrompt('hook_2', `The token is ${SECRET}.`))] });
  assert.ok(!gapsOf(alone).includes('capability-unmeasured:actions'));
  assert.ok(alone.contexts.some((context) => context.author === 'runtime' && context.text.includes(SECRET)), 'one joining no message is read as the runtime\'s words');
  assertNothingLeaks(report(alone));
});

test('X31: a copy of the agent\'s words the editor wrote leaves its words open, never an action unjoined', async (t) => {
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT), turnContext(TURN),
    { type: 'event_msg', payload: { type: 'agent_message', message: `Done. The token is ${SECRET}.` } },
  ] });

  assert.ok(gapsOf(model).includes('relation-unresolved:own-words'));
  assert.ok(!gapsOf(model).includes('relation-unresolved'));
  assert.ok(model.contexts.some((context) => context.author === 'agent' && context.text.includes(SECRET)), 'what it holds is still read');
  assertNothingLeaks(report(model));
});

test('X5: a file no tree can hold is no missing source of this one; a folder that could not be read still is', async (t) => {
  const root = await writeSession(t, {
    [rolloutPath(ROOT, '01')]: jsonl(meta(ROOT), turnContext(TURN)),
    // Its first line is no session's, so no chain of parents runs through it.
    '2026/09/02/rollout-2026-09-02T10-00-00-unrelated.jsonl': jsonl({ type: CANARY, payload: {} }),
    '2026/09/03/rollout-2026-09-03T10-00-00-other.jsonl': jsonl(meta('01a0ec9c-0000-7000-8000-00000000000f')),
  });
  const readWith = (reader: FaultyFileSystem | NodeFileSystem) => new CodexSessionSource({
    discovery: new CodexSessionDiscovery({ directories: reader, files: reader }), files: reader, sessionsRoot: root,
  }).read(join(root, rolloutPath(ROOT, '01')));

  assert.deepEqual(gapsOf(await readWith(files)).filter((gap) => gap === 'source-missing'), []);
  const faulty = new FaultyFileSystem(files, [join(root, '2026/09/03')]);
  assert.deepEqual(gapsOf(await readWith(faulty)).filter((gap) => gap === 'source-missing'), ['source-missing'], 'it may have held a child');
});

test('X31: a phase named like an inherited property is no channel', async (t) => {
  const model = await read(t, { [rolloutPath(ROOT)]: [meta(ROOT), turnContext(TURN), said('msg_1', 'constructor', 'Checking now.')] });

  assert.deepEqual(model.messages.map((message) => [message.id, message.channel]), [['msg_1', undefined]]);
});

test('X31: a completion whose text differs from its turn\'s final answer is no copy of it: it is kept and scanned', async (t) => {
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT), turnContext(TURN),
    said('msg_1', 'final_answer', 'Done.'),
    taskComplete(TURN, `Done. The token is ${SECRET}.`),
  ] });

  assert.deepEqual(model.messages.map((message) => [message.id, message.copies?.length ?? 0]), [['msg_1', 0]]);
  assert.ok(gapsOf(model).includes('relation-unresolved:own-words'), 'a text that joins nothing is said to, as a question of its words');
  assert.ok(!gapsOf(model).includes('relation-unresolved'), 'never as an action left unjoined');
  assert.ok(model.contexts.some((context) => context.kind === 'conversation' && context.author === 'agent' && context.text.includes(SECRET)),
    'the text only the completion holds is still read');
  assertNothingLeaks(report(model));

  // A trailing newline holds no value: that completion is still the answer's copy, and the session is not left unresolved.
  const trailing = await read(t, { [rolloutPath(ROOT)]: [meta(ROOT), turnContext(TURN), said('msg_1', 'final_answer', 'Done.'), taskComplete(TURN, 'Done.\n')] });
  assert.deepEqual(trailing.messages.map((message) => [message.id, message.copies?.length ?? 0]), [['msg_1', 1]]);
  assert.ok(!gapsOf(trailing).some((gap) => gap.startsWith('relation-unresolved')));
});

test('X5: a tree gathers children across date folders by recorded parents; a copy outside the root stands alone', async (t) => {
  const root = await writeSession(t, {
    [rolloutPath(ROOT, '01')]: jsonl(meta(ROOT)),
    [rolloutPath(CHILD, '02')]: jsonl(spawnedMeta(CHILD, ROOT, '/root/a')),
    [rolloutPath(SECOND_CHILD, '03')]: jsonl(spawnedMeta(SECOND_CHILD, CHILD, '/root/a/b', { source: { subagent: { thread_spawn: { parent_thread_id: CHILD, depth: 2, agent_path: '/root/a/b' } } } })),
    [`elsewhere/rollout-copy-${ROOT}.jsonl`]: jsonl(meta(ROOT)),
  });
  const discovery = new CodexSessionDiscovery({ directories: files, files });
  const sessions = join(root, '2026');

  const tree = await discovery.tree(join(root, rolloutPath(ROOT, '01')), sessions);
  assert.equal(tree.kind, 'tree');
  if (tree.kind !== 'tree') return;
  assert.deepEqual(tree.members.map((member) => [member.header.id, member.parent]), [[ROOT, undefined], [CHILD, 0], [SECOND_CHILD, 1]]);

  // Outside the sessions root only its own folder is searched, so the original it was copied from does not collide.
  const copy = await discovery.tree(join(root, `elsewhere/rollout-copy-${ROOT}.jsonl`), sessions);
  assert.equal(copy.kind === 'tree' ? copy.members.length : -1, 1);
  assert.equal(copy.kind === 'tree' ? copy.rootShared : undefined, false);

  // Two files holding the root's id inside the searched root: nothing joins it (X3).
  const shared = await discovery.tree(join(root, rolloutPath(ROOT, '01')), root);
  assert.equal(shared.kind === 'tree' ? shared.rootShared : undefined, true);
  assert.equal(shared.kind === 'tree' ? shared.members.length : -1, 1);
});

test('a file that is not a Codex session is no session, never read as the nearer format', async (t) => {
  const model = await read(t, { 'claude.jsonl': [{ type: 'user', message: { role: 'user', content: CANARY } }] }, 'claude.jsonl');
  assert.deepEqual(model.gaps, [{ kind: 'session-missing' }]);
  assert.deepEqual(model.events, []);
});

// `codex-blocks-too` CK12, CKB7: a command agentwhy's hook refused ran nowhere and left no item; the cell's output holds
// Codex's words around agentwhy's reason, which is read as a stopped call on the path the reason names.
test('CK12: a command agentwhy refused is a stopped shell call, and reaches nothing', async (t) => {
  const reason = refusalReason('.env', '**/.env*', 0, { kind: 'glob', word: '.env*' }).trimEnd();
  const line = "rg --files --hidden -g '.env*'";
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT), turnContext(TURN),
    cell('call_a', `const r = await tools.exec_command({ cmd: "${line}" }) // ${CANARY}`),
    cellOutput('call_a', `Script error:\nCommand blocked by PreToolUse hook: ${reason}. Command: ${line}`),
    cell('call_b', 'await tools.exec_command({ cmd: "ls" })'),
    cellOutput('call_b', 'README.md\n'),
  ] });

  // XD4: the refused cell is read from its refusal alone, never also as a command that ran; the next cell's is read.
  assert.deepEqual(model.events.map((event) => [event.toolName, event.outcome, event.targets, event.commands]), [
    ['Bash', 'blocked', ['.env'], [line]],
    ['exec_command', 'unknown', [], ['ls']],
  ]);
  const built = report(model);
  assert.equal(built.tally.refusedAttempts, 1);
  assert.equal(built.tally.filesReached, 0);
  assert.equal(built.tally.contentsSeen, 0);
  assertNothingLeaks(built);
});

// `2026-10-07-a-file-in-its-place.md` IP4, IPB9: a command item's own `cwd` is relative, and its turn names the absolute
// folder - every one measured on 2026-10-07 was so. The call carries where it ran, resolved, for a rule naming a place.
test('IP4: a command carries the folder it ran in, its own cwd read from its turn’s', async (t) => {
  const model = await read(t, { [rolloutPath(ROOT)]: [
    meta(ROOT), turnContext(TURN),
    item(ROOT, { ...command('exec_a', 'cat sub/canary.txt', 'x'), cwd: 'apps/web' }),
    item(ROOT, { ...command('exec_b', 'cat canary.txt', 'x'), cwd: '' }),
    turnContext(LATER_TURN, { cwd: '/Users/someone/Projects/blog' }),
    item(ROOT, { ...command('exec_c', 'ls', 'x'), cwd: '.' }, LATER_TURN),
  ] });
  assert.deepEqual(model.events.map((event) => [event.id, event.workingDirectory]), [
    ['exec_a', '/Users/someone/Projects/shop/apps/web'],
    ['exec_b', '/Users/someone/Projects/shop'],
    ['exec_c', '/Users/someone/Projects/blog'],
  ]);
});
