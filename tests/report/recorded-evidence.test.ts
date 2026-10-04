// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { correlate } from '../../src/core/correlation/correlate.ts';
import { agentSource, mainSource } from '../../src/core/evidence.ts';
import type { Execution } from '../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../src/core/policy/default-policy.ts';
import { Redactor } from '../../src/core/redaction/redactor.ts';
import type { CallRecord, ResultRecord, SessionRecords } from '../../src/core/session-records.ts';
import { buildReport } from '../../src/report/build-report.ts';
import { actionsOf } from '../../src/report/check/session-actions.ts';
import { fileStory } from '../../src/report/render/report-page/file-story.ts';
import { helperViews } from '../../src/report/render/report-page/helpers.ts';
import { agentRuns } from '../../src/report/render/report-page/record-view.ts';
import { ReportPageRenderer } from '../../src/report/render/report-page/report-page-renderer.ts';
import { toDoItems } from '../../src/report/render/report-page/to-do.ts';
import { buildSessionView } from '../../src/report/render/session-view.ts';
import type { ReportModel } from '../../src/report/report-model.ts';

// `.ai/specs/2026-09-27-what-codex-wrote.md` §4.G, X10, X11, X17, X31, and the acceptance table of its plan: the rules for
// evidence a runtime records about running a call, through `correlate` and `buildReport`, with no adapter in between.
// The values are invented and assembled at run time.
const VALUE = ['orchid', 'Lantern', '4821', 'tide'].join('-');
const ENV = `PROJECT_TOKEN=${VALUE}\nDEBUG=true`;
const MAIN = 'main';
const HELPER = 'helper';

let record = 0;
const at = (agentId = MAIN) => ({ source: agentId === MAIN ? mainSource() : agentSource(agentId), record: (record += 1) });

function shell(id: string, command: string, agentId = MAIN): CallRecord {
  return {
    id, agentId, sequence: record, toolName: 'shell', input: { command }, targets: [], commands: [command],
    resultShape: 'listing', toolKnown: true, evidence: at(agentId),
  };
}

function ran(callId: string, output: string, execution: Execution, agentId = MAIN): ResultRecord {
  return { callId, content: output, stage: 'execution', completeness: 'unknown', execution, evidence: at(agentId) };
}

function records(overrides: Partial<SessionRecords>): SessionRecords {
  return {
    sessionId: MAIN, provider: 'codex', agents: [{ id: MAIN, type: 'main', depth: 0 }], calls: [], results: [], delegations: [], delegationIndex: [],
    messages: [], deliveredReports: [], agentReports: [], workingDirectories: ['/Users/someone/Projects/shop'], followUps: [], followUpIndex: [],
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [], gaps: [], ...overrides,
  };
}

function report(overrides: Partial<SessionRecords>): ReportModel {
  const model = correlate(records(overrides));
  return buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, false), { share: false, projectRoot: model.projectRoot });
}

const seen = (built: ReportModel): number => buildSessionView(built).agents.filter((entry) => entry.saw).length;

test('a failed read with only a missing-file diagnostic reaches nothing, and the attempt stays visible', () => {
  const built = report({
    calls: [shell('exec_a', 'cat .env')],
    results: [ran('exec_a', 'cat: .env: No such file or directory\n', { status: 'failed', exitCode: 1 })],
  });

  assert.equal(built.tally.filesReached, 0);
  assert.equal(built.tally.contentsSeen, 0);
  assert.equal(built.tally.unknownAttempts, 1);
  assert.deepEqual(built.stories.map((story) => [story.path, story.outcome]), [['.env', 'unknown']]);
  assert.equal(built.headline.severity, 'attention', 'an attempt with no established outcome is never "nothing happened"');
  assert.ok(built.missing.some((line) => /the record does not show all of this: what an action reached/.test(line)));
  assert.ok(built.gaps.some((gap) => gap.kind === 'capability-absent' && gap.question === 'access'), 'and by kind, for a page to say it');
});

test('exit 0 with an effect no profile establishes confirms no read either', () => {
  const built = report({
    calls: [shell('exec_a', 'python3 read.py .env')],
    results: [ran('exec_a', ENV, { status: 'completed', exitCode: 0 })],
  });

  assert.equal(built.tally.filesReached, 0);
  assert.equal(built.tally.unknownAttempts, 1);
});

test('one proven read and one failed target: only the proven file counts, whatever the final exit', () => {
  const built = report({
    calls: [shell('exec_a', 'grep -n PROJECT_TOKEN .env apps/web/.env')],
    // grep exits 2 when one file is missing; the other's numbered hit shows it was read. The diagnostic names a path too.
    results: [ran('exec_a', `.env:1:PROJECT_TOKEN=${VALUE}\ngrep: apps/web/.env: No such file or directory\n`, { status: 'failed', exitCode: 2 })],
  });

  assert.equal(built.tally.filesReached, 1);
  assert.deepEqual(built.stories.map((story) => [story.path, story.outcome]).sort(), [['.env', 'succeeded'], ['apps/web/.env', 'unknown']]);
  assert.equal(built.tally.unknownAttempts, 1);
  // Printed to the process, not handed to the model: the file was read, and nobody is said to have seen its lines.
  assert.equal(built.tally.contentsSeen, 0);
});

test('a call whose files had different outcomes gives each its own step, so the flow agrees with the tally', () => {
  const built = report({
    calls: [shell('exec_a', 'grep -n PROJECT_TOKEN .env apps/web/.env')],
    results: [{
      callId: 'exec_a', content: `.env:1:PROJECT_TOKEN=${VALUE}\ngrep: apps/web/.env: No such file or directory\n`, stage: 'model',
      completeness: 'unknown', execution: { status: 'failed', exitCode: 2 }, evidence: at(),
    }],
  });

  const reached = built.flows.flatMap((flow) => flow.steps).flatMap((step) => (step.kind === 'reached' ? [[step.files, step.outcome]] : []));
  assert.deepEqual(reached, [[['.env'], 'succeeded'], [['apps/web/.env'], 'unknown']]);
  assert.equal(built.tally.filesReached, 1);
  assert.equal(built.tally.contentsSeen, 1, 'the printed lines of the file reached were handed to the model');
  assert.equal(seen(built), built.tally.contentsSeen);
});

test('a value in the recorded output with only a count delivered is kept as found, with no agent said to have seen it', () => {
  const built = report({
    calls: [shell('exec_a', 'cat .env')],
    results: [ran('exec_a', ENV, { status: 'completed', exitCode: 0 })],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: 'Script completed\n33', completeness: 'complete', evidence: at() }],
  });

  assert.equal(built.tally.filesReached, 1, 'the read is established');
  assert.deepEqual(built.privateFiles.map((file) => [file.path, file.names.length > 0]), [['.env', true]], 'what the file holds is still read');
  assert.equal(built.tally.contentsSeen, 0, 'no model was handed the value');
  assert.equal(seen(built), built.tally.contentsSeen);
});

test('the same value delivered to the model is seen once, and a later use names the delivery as its source', () => {
  const built = report({
    calls: [shell('exec_a', 'cat .env')],
    results: [ran('exec_a', ENV, { status: 'completed', exitCode: 0 })],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: `Script completed\n${ENV}`, completeness: 'complete', evidence: at() }],
    messages: [{ agentId: MAIN, kind: 'said', text: `The token is ${VALUE}.`, completeness: 'complete', evidence: at() }],
  });

  assert.equal(built.tally.contentsSeen, 1);
  assert.equal(seen(built), built.tally.contentsSeen, 'the page and the index say the same');
  assert.deepEqual(built.graph.main.received, ['.env']);
  assert.deepEqual(built.uses.map((use) => [use.landed, use.source]), [['said', 'delivered']]);
  assert.ok(!JSON.stringify(built).includes(VALUE), 'the value itself never enters the report');
});

// Found by looking at the page: the index said the conversation read `.env`, and its report said "only saw a name -
// nothing to do", because every reader but the index went by the steps of calls, and no call returned the value.
test('a value its code handed back is a read on every page that says what was read, and names no call', () => {
  const built = report({
    calls: [shell('exec_a', 'cat .env')],
    results: [ran('exec_a', ENV, { status: 'completed', exitCode: 0 })],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: `Script completed\n${ENV}`, completeness: 'complete', evidence: at() }],
  });

  const steps = built.flows.find((flow) => flow.agentIndex === 0)?.steps ?? [];
  assert.deepEqual(steps.map((step) => step.kind), ['reached', 'received']);
  const reached = steps[0];
  assert.ok(reached?.kind === 'reached' && reached.processOutput === true && !reached.carriedValue, 'the command is not said to have shown it');
  assert.deepEqual(actionsOf(built).rotate.map((file) => file.path), ['.env'], 'check, To fix and the to-do list');
  assert.deepEqual(toDoItems(built).map((item) => item.path), ['.env']);
  assert.deepEqual(helperViews(built).map((view) => view.status), ['read']);
  const story = fileStory(built, '.env');
  assert.deepEqual(story.entries.map((entry) => [entry.kind, entry.received === true]), [['named', false], ['read', true]]);
  assert.equal(story.readers, 1);
  assert.equal(story.opened, 1, 'only the command reached the file');

  const tab = agentRuns(built);
  assert.match(tab, /lang="en">Was handed the file’s contents</);
  assert.match(tab, /We see what the command printed, not how much of it reached the AI\./);
  assert.ok(!tab.includes('The contents did not come back'), 'what a process printed is not what the agent was handed (X10)');
});

test('a value only in the recorded output is not a read, and no page says it was', () => {
  const built = report({
    calls: [shell('exec_a', 'cat .env')],
    results: [ran('exec_a', ENV, { status: 'completed', exitCode: 0 })],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: 'Script completed\n33', completeness: 'complete', evidence: at() }],
  });

  assert.deepEqual(built.flows[0]?.steps.map((step) => step.kind), ['reached']);
  assert.deepEqual(actionsOf(built).rotate, []);
  assert.deepEqual(toDoItems(built), []);
});

// Found in the maintainer's run: under "Codex doesn't record every step, so we can't say it read nothing private" the
// same screen said of `.env` "It didn't see what is inside, so nothing to do" (X10).
test('a name seen in a record with gaps is never "nothing to do"', () => {
  const built = report({
    calls: [shell('exec_a', 'cat .env')],
    results: [ran('exec_a', ENV, { status: 'completed', exitCode: 0 })],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: 'Script completed\n33', completeness: 'complete', evidence: at() }],
    capabilities: [{ question: 'actions', state: 'absent', source: mainSource() }],
  });
  const page = new ReportPageRenderer().render({ report: built, withIndexLink: false });

  assert.match(page, /lang="en">It saw 1 private file name\./);
  assert.match(page, /lang="en">The record doesn’t show whether it saw what is inside\./);
  assert.ok(!page.includes('so nothing to do'), 'the gap card above it says what the record cannot show');
});

test('a value only in a follow-up is handed to that helper once, and never counts a second helper', () => {
  const spawn: CallRecord = { ...shell('call_spawn', ''), toolName: 'spawn_agent', commands: [], input: { task_name: 'check' }, resultShape: 'none' };
  const built = report({
    agents: [{ id: MAIN, type: 'main', depth: 0 }, { id: HELPER, type: 'subagent', depth: 1 }],
    calls: [shell('exec_a', 'cat .env'), spawn],
    results: [
      ran('exec_a', ENV, { status: 'completed', exitCode: 0 }),
      { callId: 'call_spawn', content: 'started', launchNotice: true, stage: 'model', completeness: 'complete', evidence: at() },
    ],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: ENV, completeness: 'complete', evidence: at() }],
    delegations: [{ callId: 'call_spawn', parentAgentId: MAIN, prompt: 'Look at the settings.', description: 'check', evidence: spawn.evidence }],
    delegationIndex: [{ callId: 'call_spawn', agentId: HELPER, depth: 1, recordedParentAgentId: MAIN }],
    followUps: [{ callId: 'call_more', senderAgentId: MAIN, text: `Use ${VALUE} to sign in.`, evidence: at() }],
    followUpIndex: [{ callId: 'call_more', agentId: HELPER }],
  });

  assert.equal(built.delegations.length, 1, 'one helper, one row');
  assert.deepEqual(built.uses.map((use) => [use.agentIndex, use.landed]), [[0, 'delegation']]);
  assert.ok(!JSON.stringify(built).includes(VALUE));
});

test('a value only in a final message is found for the main agent; user text with it is not the agent writing it', () => {
  const built = report({
    calls: [shell('exec_a', 'cat .env')],
    results: [ran('exec_a', ENV, { status: 'completed', exitCode: 0 })],
    contexts: [{ kind: 'conversation', author: 'person', agentId: MAIN, text: `Is ${VALUE} right?`, completeness: 'complete', evidence: at() }],
    messages: [{ agentId: MAIN, kind: 'said', text: `Yes, ${VALUE}.`, channel: 'final', completeness: 'complete', evidence: at() }],
  });

  assert.deepEqual(built.uses.map((use) => [use.landed, use.source]), [['said', 'none']], 'one use: the agent\'s own words');
  assert.equal(built.tally.wroteInMessages, 1);
  assert.ok(!JSON.stringify(built).includes(VALUE));
});

// X19-X23: what the runtime recorded crosses the boundary as settings, indexes, sizes and counts - never its free text -
// and beside the evaluation policy, which it never changes.
test('recorded permissions, reviews, later words and capabilities reach the report redacted and apart from the policy', () => {
  const permissions = (write: string) => ({
    approval: 'never', approver: 'person' as const, sandbox: 'workspace-write', network: 'restricted' as const, complete: true,
    scopes: [{ access: 'read' as const, target: { kind: 'special' as const } }, { access: 'write' as const, target: { kind: 'path' as const, path: write } }],
  });
  const reviewer = { source: { kind: 'review' as const, reviewId: 'r1' }, record: 2 };
  const spawn: CallRecord = { ...shell('call_spawn', ''), toolName: 'spawn_agent', commands: [], input: {}, resultShape: 'none' };
  const overrides: Partial<SessionRecords> = {
    agents: [{ id: MAIN, type: 'main', depth: 0 }, { id: HELPER, type: 'subagent', depth: 1 }],
    calls: [shell('exec_a', 'cat .env'), spawn],
    results: [
      ran('exec_a', ENV, { status: 'completed', exitCode: 0 }),
      { callId: 'call_spawn', content: 'started', launchNotice: true, stage: 'model', completeness: 'complete', evidence: at() },
    ],
    delegations: [{ callId: 'call_spawn', parentAgentId: MAIN, prompt: 'Look.', evidence: spawn.evidence }],
    delegationIndex: [{ callId: 'call_spawn', agentId: HELPER }],
    followUps: [{ callId: 'call_more', senderAgentId: MAIN, text: `Use ${VALUE} now.`, evidence: at() }],
    followUpIndex: [{ callId: 'call_more', agentId: HELPER }],
    turns: [
      { id: 't1', agentId: MAIN, permissions: permissions('/Users/someone/Projects/shop'), evidence: at() },
      { id: 't2', agentId: MAIN, permissions: permissions('/Users/someone/Projects/shop'), evidence: at() },
      { id: 't1', agentId: HELPER, permissions: permissions('/Users/someone/elsewhere'), evidence: at(HELPER) },
    ],
    reviews: [{
      id: 'r1', reviewedAgentId: MAIN, evidence: reviewer,
      verdicts: [
        { outcome: 'allowed', turnId: 't1', risk: 'low', rationale: `Reading ${VALUE} is fine.`, evidence: reviewer },
        { outcome: 'unrecognised', evidence: { ...reviewer, record: 3 } },
      ],
    }],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: 'Script completed', completeness: 'complete', evidence: at() }],
    contexts: [{ kind: 'code', author: 'agent', agentId: MAIN, text: 'await tools.exec_command()', completeness: 'complete', evidence: at() }],
    capabilities: [
      { question: 'actions', state: 'absent', source: mainSource(), agentId: MAIN },
      { question: 'actions', state: 'absent', source: agentSource(HELPER), agentId: HELPER },
      { question: 'own-words', state: 'supported', source: mainSource(), agentId: MAIN },
    ],
  };
  const full = report(overrides);
  const { recorded } = full;

  assert.deepEqual(recorded.permissions.map((each) => [each.turns, each.agentIndexes, each.approval, each.sandbox, each.readScopes, each.writeScopes, each.writablePaths]), [
    [2, [0], 'never', 'workspace-write', 1, 1, ['.']],
    [1, [1], 'never', 'workspace-write', 1, 1, ['/Users/someone/elsewhere']],
  ]);
  assert.deepEqual(recorded.reviews, [{
    reviewedAgentIndex: 0,
    verdicts: [
      { outcome: 'allowed', turnKnown: true, risk: 'low', rationaleSize: `Reading ${VALUE} is fine.`.length, evidence: 'review 1 record 2' },
      { outcome: 'unrecognised', turnKnown: false, evidence: 'review 1 record 3' },
    ],
  }]);
  assert.deepEqual(full.delegations[0]?.laterInstructions.map((each) => each.size), [`Use ${VALUE} now.`.length]);
  assert.deepEqual(recorded.capabilities, [
    { question: 'actions', state: 'absent', sources: 2 }, { question: 'own-words', state: 'supported', sources: 1 },
  ]);
  assert.equal(recorded.deliveries, 1);
  assert.deepEqual(recorded.contexts, { code: 1, conversation: 0, 'unjoined-instruction': 0, 'orphan-output': 0 });
  // X21, X22: the policy the report was evaluated by is its own, whatever was recorded then.
  assert.match(full.scope.policy.origin, /BUILT-IN DEFAULT/);
  assert.equal(full.tally.filesReached, report({ ...overrides, turns: [] }).tally.filesReached, 'recorded permissions decide nothing');
  assert.ok(!JSON.stringify(full).includes(VALUE), 'no free text of a reviewer or an instruction is quoted');

  // Shared, a path outside the project is a category, as every other path is.
  const model = correlate(records(overrides));
  const shared = buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, true), { share: true, projectRoot: model.projectRoot });
  assert.deepEqual(shared.recorded.permissions.map((each) => each.writablePaths), [['.'], ['outside the project']]);
});
