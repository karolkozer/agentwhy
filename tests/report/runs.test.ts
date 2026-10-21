// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Delegation } from '../../src/core/delegation.ts';
import type { ToolEvent } from '../../src/core/event.ts';
import type { AgentMessage } from '../../src/core/message.ts';
import { DEFAULT_POLICY } from '../../src/core/policy/default-policy.ts';
import { Redactor } from '../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../src/core/session-model.ts';
import { buildReport } from '../../src/report/build-report.ts';
import { RUN_FILES_KEPT } from '../../src/report/runs.ts';

// `specs/2026-10-11-step-by-step.md` SB1-SB7: every call of every AI, grouped by what it wrote before them.

let record = 0;
const at = (agentId: string) => {
  record += 1;
  return { source: agentId === 'main' ? { kind: 'main' as const } : { kind: 'agent' as const, agentId }, record };
};

let sequence = 0;
function read(path: string, content: string, agentId = 'main', extra: Partial<ToolEvent> = {}): ToolEvent {
  sequence += 1;
  const evidence = at(agentId);
  return {
    id: 'call-' + sequence, agentId, sequence, toolName: 'Read', input: {}, targets: [path], commands: [], resultShape: 'content',
    toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content, evidence }, ...extra,
  };
}

function list(folder: string, names: readonly string[], agentId = 'main'): ToolEvent {
  return read(folder, names.join('\n'), agentId, { toolName: 'Bash', targets: [], commands: ['ls ' + folder], resultShape: 'listing' });
}

function said(text: string, agentId = 'main', kind: AgentMessage['kind'] = 'said'): AgentMessage {
  return { agentId, kind, text, completeness: 'complete', evidence: at(agentId) };
}

function report(events: ToolEvent[], messages: AgentMessage[], helpers: Delegation[] = []) {
  const model: SessionModel = {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' },
    agents: [{ id: 'main', type: 'main', depth: 0 }, ...helpers.map((helper) => ({ id: helper.childAgentId as string, depth: 1 }))],
    delegations: helpers, events, completeness: 'complete', messages, gaps: [],
  };
  return buildReport(model, DEFAULT_POLICY, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
}

function handOver(child: string, description: string, back = true): { event: ToolEvent; delegation: Delegation } {
  sequence += 1;
  const evidence = at('main');
  const event: ToolEvent = {
    id: 'task-' + child, agentId: 'main', sequence, toolName: 'Task', input: {}, targets: [], commands: [], resultShape: 'none',
    toolKnown: true, outcome: back ? 'succeeded' : 'unknown', evidence, completeness: 'complete',
    ...(back ? { result: { stage: 'model' as const, completeness: 'complete' as const, content: 'done', evidence } } : {}),
  };
  const delegation: Delegation = {
    followUps: [], id: event.id, parentAgentId: 'main', childAgentId: child, description, prompt: 'p', reports: [],
    evidence, completeness: 'complete',
  };
  return { event, delegation };
}

// SB1, R2: one stretch of writing and the calls after it are one run; words written again start the next.
test('the calls after one stretch of writing are one run, and its words are said once', () => {
  const messages = [said('I will read the payment code first.')];
  const events = [read('src/a.ts', 'a'), read('src/b.ts', 'b'), read('src/c.ts', 'c')];
  messages.push(said('Now the settings.'));
  events.push(read('config/app.json', '{}'));
  const runs = report(events, messages).runs ?? [];
  assert.equal(runs.length, 1);
  const main = runs[0];
  assert.deepEqual(main?.runs.map((run) => run.steps.length), [3, 1]);
  assert.equal(main?.runs[0]?.wrote.sentence, 'I will read the payment code first.');
  assert.equal(main?.runs[0]?.wrote.covers, 3);
  assert.equal(main?.runs[0]?.wrote.kind, 'said');
  assert.equal(main?.runs[1]?.wrote.sentence, 'Now the settings.');
});

// R3: a call with nothing written before it is a run that says so, never the words of the run before.
test('a call with nothing written before it carries no words', () => {
  const runs = report([read('src/a.ts', 'a')], []).runs ?? [];
  const wrote = runs[0]?.runs[0]?.wrote;
  assert.equal(wrote?.size, 0);
  assert.equal(wrote?.sentence, undefined);
});

// SB3, SB4: private files first, and past the most a step keeps, the rest are counted.
test('a listing keeps private files first, and counts what it does not keep', () => {
  const names = Array.from({ length: 30 }, (_, at) => 'file-' + at + '.txt');
  const runs = report([list('.', [...names, '.env'])], []).runs ?? [];
  const step = runs[0]?.runs[0]?.steps[0];
  assert.equal(step?.files.length, RUN_FILES_KEPT);
  assert.equal(step?.filesLeftOut, 31 - RUN_FILES_KEPT);
  assert.equal(step?.files[0]?.path, '.env');
  assert.equal(step?.files[0]?.private, true);
  assert.equal(step?.files[0]?.how, 'named');
  assert.equal(step?.files[1]?.private, undefined);
});

// SB5: a read of a name printed earlier by the same AI points back at that step.
test('a later read of a name the same AI saw earlier says where it saw it', () => {
  const runs = report([list('.', ['README.md', '.env']), read('src/a.ts', 'a'), read('.env', 'NODE_ENV=dev')], []).runs ?? [];
  const steps = runs[0]?.runs.flatMap((run) => run.steps) ?? [];
  const env = steps[2]?.files.find((file) => file.path === '.env');
  assert.equal(env?.how, 'read');
  assert.equal(env?.seenAt, 0);
  assert.equal(steps[0]?.files.find((file) => file.path === '.env')?.seenAt, undefined, 'a name is not seen before itself');
});

// SB2: a hand-over carries its helper, its job and whether the work came back; it reaches no file itself.
test('a hand-over names its helper and its job, and the helper has its own runs', () => {
  const words = said('I will split this up.');
  const first = handOver('h1', 'Write a test for the webhook');
  const second = handOver('h2', 'Find the settings', false);
  const runs = report([
    first.event, second.event,
    read('.env', 'NODE_ENV=dev', 'h1'),
    read('config/app.json', '{}', 'h2'),
  ], [words], [first.delegation, second.delegation]).runs ?? [];
  assert.equal(runs.length, 3, 'your AI and its two helpers');
  const main = runs[0];
  assert.equal(main?.runs.length, 1, 'two hand-overs after one stretch of writing are one run');
  const [toFirst, toSecond] = main?.runs[0]?.steps ?? [];
  assert.equal(toFirst?.gave?.askedTo, 'Write a test for the webhook');
  assert.equal(toFirst?.gave?.back, true);
  assert.equal(toSecond?.gave?.back, false);
  assert.deepEqual(toFirst?.files, []);
  assert.equal(runs[1]?.agentIndex, toFirst?.gave?.agentIndex);
  assert.equal(runs[1]?.runs[0]?.steps[0]?.files[0]?.how, 'read');
});

// SB7: your AI said something after its last call.
test('an AI that spoke after its last call answered', () => {
  const runs = report([read('src/a.ts', 'a')], [said('Done.')]).runs ?? [];
  assert.equal(runs[0]?.answered, true);
  const quiet = report([read('src/a.ts', 'a')], []).runs ?? [];
  assert.equal(quiet[0]?.answered, undefined);
});

// SB3: one rule for a call and a file - every first step of a file on the Files tab is a step here, doing the same.
test('the Files tab and the runs agree on how each file was first reached', () => {
  const built = report([
    list('.', ['README.md', '.env', 'src']),
    read('.env', 'NODE_ENV=dev'),
    read('README.md', '# app'),
    read('config/secrets.json', 'Permission denied', 'main', { outcome: 'blocked' }),
  ], []);
  const steps = (built.runs ?? []).flatMap((agent) => agent.runs.flatMap((run) => run.steps.map((step) => ({ agent: agent.agentIndex, step }))));
  for (const fileStep of built.fileSteps ?? []) {
    const match = steps.find(({ agent, step }) => agent === fileStep.agentIndex && step.sequence === fileStep.step &&
      step.files.some((file) => file.path === fileStep.path && file.how === fileStep.how));
    assert.ok(match !== undefined, `${fileStep.path} ${fileStep.how ?? ''} at step ${fileStep.step}`);
  }
});

// R12b, P32a: a tool the adapter has no profile for has its whole input as targets. The Claude desktop app's plan and
// recap tools made "+6 names it only saw" in By folder of a plan's items, `pending` and the closing recap (the maintainer's
// round, 2026-10-21). Such a step names no everyday file, as Files has none of them; a private path keeps its row.
test('a tool the adapter does not know names no everyday file by its input, and keeps a private path it names', () => {
  const plan = read('', 'ok', 'main', {
    toolName: 'mcp__ccd_turn__update_plan', toolKnown: false, outcome: 'unknown', resultShape: 'listing',
    input: { items: [{ id: 'first_task', text: 'Check .env for the key', status: 'pending' }] },
    targets: ['first_task', 'Check .env for the key', 'pending', '.env'],
  });
  const built = report([plan], []);
  const step = built.runs?.[0]?.runs[0]?.steps[0];
  assert.equal(step?.toolKnown, false, 'the step stays, as a tool we don’t recognise');
  assert.deepEqual(step?.files.map((file) => String(file.path)), ['.env']);
  assert.ok(built.findings.some((finding) => String(finding.path) === '.env'), 'the private path is a row of Files, and so a file of the step (SB3)');
});

// Invariant 1: a step's words cross the redaction boundary like the flow's.
test('under --share no sentence is kept', () => {
  const model: SessionModel = {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }],
    delegations: [], events: [], completeness: 'complete', messages: [], gaps: [],
  };
  const messages = [said('Reading the payment code.')];
  const events = [read('src/a.ts', 'a')];
  const shared = buildReport({ ...model, events, messages }, DEFAULT_POLICY, new Redactor('test'), { share: true, projectRoot: { kind: 'absent' } });
  const wrote = shared.runs?.[0]?.runs[0]?.wrote;
  assert.equal(wrote?.sentence, undefined);
  assert.ok((wrote?.size ?? 0) > 0);
});
