// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Agent } from '../../../src/core/agent.ts';
import type { Delegation } from '../../../src/core/delegation.ts';
import type { EventOutcome, ToolEvent } from '../../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../../src/core/policy/default-policy.ts';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../../src/core/session-model.ts';
import { buildReport } from '../../../src/report/build-report.ts';
import { buildSessionView } from '../../../src/report/render/session-view.ts';

const main: Agent = { id: 'main', type: 'main', depth: 0 };

function session(agents: Agent[], delegations: Delegation[], events: ToolEvent[]): SessionModel {
  return {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: main.id,
    projectRoot: { kind: 'absent' },
    agents: [main, ...agents],
    delegations,
    events,
    completeness: 'complete',
    messages: [],
    gaps: [],
  };
}

function touch(id: string, agentId: string, target: string, outcome: EventOutcome, sequence: number, viaResult = false): ToolEvent {
  const evidence = { source: { kind: 'agent' as const, agentId }, record: sequence };
  return {
    id, agentId, sequence, toolName: viaResult ? 'Bash' : 'Read',
    // A search that prints only names: its hit lines would be the file's text (search-hits-are-reads H5), a read.
    input: {}, targets: viaResult ? [] : [target], commands: viaResult ? ['grep -rl SECRET apps'] : [],
    // Only a listing says the call reached what it names, so that is what a result-sourced touch has to be.
    resultShape: viaResult ? 'listing' : 'content', toolKnown: true, outcome, evidence,
    completeness: outcome === 'unknown' ? 'partial' : 'complete',
    ...(outcome === 'unknown' ? {} : { result: { content: viaResult ? target : 'content', stage: 'model', completeness: 'complete', evidence } }),
  };
}

const delegation = (id: string, parentAgentId: string, childAgentId: string, description: string): Delegation => ({
  followUps: [],
  id, parentAgentId, childAgentId, description, prompt: 'private',
  reports: [], evidence: { source: { kind: 'agent', agentId: parentAgentId }, record: 1 }, completeness: 'complete',
});

const view = (model: SessionModel) => buildSessionView(buildReport(model, DEFAULT_POLICY, new Redactor('view-test')));

// A refusal hidden behind a worse outcome is still a refusal: the filter has to be able to find it.
test('an agent is counted in every outcome it had, and named by the worst of them', () => {
  const built = view(session([], [], [
    touch('a', 'main', 'apps/web/.env', 'blocked', 1),
    touch('b', 'main', 'apps/web/.npmrc', 'succeeded', 2),
    touch('c', 'main', 'apps/web/.env.test', 'succeeded', 3, true),
  ]));
  // The read returned the file's contents, so that touch is data seen, not a bare path, and it is counted once.
  assert.equal(built.main.tier, 'value');
  assert.deepEqual([...built.main.tiers], ['value', 'hit', 'block']);
  assert.equal(built.counts.value, 1);
  assert.equal(built.counts.hit, 1);
  assert.equal(built.counts.block, 1);
  assert.equal(built.counts.named, 0);
});

// search-hits-are-reads H5, H9: a hit line is the file's text, so the agent saw data from that file and no other.
test('a search that printed a protected file’s lines is data seen from that file, not a path in a result', () => {
  const printed: ToolEvent = {
    ...touch('a', 'main', 'apps/web/.env.test', 'succeeded', 1, true),
    commands: ['grep -rn SECRET apps'],
    result: { stage: 'model', completeness: 'complete', content: 'apps/web/.env.test:12:SECRET=x\napps/web/src/app.ts:3:read(SECRET)', evidence: { source: { kind: 'agent', agentId: 'main' }, record: 1 } },
  };
  const built = view(session([], [], [printed]));
  assert.equal(built.main.tier, 'value');
  assert.deepEqual([...built.main.seenFiles], ['apps/web/.env.test']);
  assert.equal(built.main.seenUncertain, false, 'each line says whose it is');
});

test('nesting follows recorded links; an agent nothing asked for is an unresolved root with its children kept', () => {
  const built = view(session([{ id: 'child' }, { id: 'grandchild' }, { id: 'orphan' }, { id: 'adopted' }], [
    delegation('one', 'main', 'child', 'Find the handler'),
    delegation('two', 'child', 'grandchild', 'Check the schema'),
    delegation('three', 'orphan', 'adopted', 'Look at the config'),
  ], []));
  const keys = built.column.map((entry) => entry.key);
  const depths = new Map(built.column.map((entry) => [entry.key, entry.depth]));
  assert.deepEqual(keys, ['agent-1', 'agent-2', 'agent-3', 'agent-4']);
  assert.equal(depths.get('agent-2'), 2, 'the grandchild sits under its parent');
  assert.equal(depths.get('agent-4'), 2, 'and so does the orphan’s own child');
  const orphan = built.agents.find((entry) => entry.key === 'agent-3');
  const adopted = built.agents.find((entry) => entry.key === 'agent-4');
  assert.equal(orphan?.unresolved, true);
  assert.equal(orphan?.parentKey, 'agent-0', 'attached to the root, with the missing link drawn as such');
  assert.equal(adopted?.unresolved, false);
  assert.equal(adopted?.parentKey, 'agent-3');
});

test('a delegation with no agent stays on the page as a gap of its own', () => {
  const built = view(session([], [{
    followUps: [],
    id: 'lost', parentAgentId: 'main', description: 'Check the webhook', prompt: 'private',
    reports: [], evidence: { source: { kind: 'main' }, record: 4 }, completeness: 'partial',
  }], []));
  const missing = built.column.filter((entry) => entry.kind === 'missing');
  assert.equal(missing.length, 1);
  assert.equal(missing[0]?.key, 'missing-agent-0');
  assert.equal(missing[0]?.parentKey, 'agent-0');
});

// Two projects can each have an `.env`; a node labelled only by the file name would merge them by eye.
test('paths that end the same way are told apart by as much of the path as it takes', () => {
  const built = view(session([], [], [
    touch('a', 'main', 'apps/web/.env', 'succeeded', 1),
    touch('b', 'main', 'services/api/.env', 'succeeded', 2),
    touch('c', 'main', 'apps/web/.npmrc', 'succeeded', 3),
  ]));
  const titles = built.targets.map((target) => target.title).sort();
  assert.deepEqual(titles, ['.npmrc', 'api/.env', 'web/.env']);
});

test('the first panel is the worst finding, so nobody has to click to see the cause', () => {
  const built = view(session([{ id: 'child' }], [delegation('one', 'main', 'child', 'Find the cause')], [
    touch('a', 'main', 'apps/web/.npmrc', 'succeeded', 1),
    touch('b', 'child', 'apps/web/.env', 'succeeded', 2, true),
  ]));
  assert.equal(built.initialKey, 'agent-1');
  assert.equal(built.agents.find((entry) => entry.key === 'agent-1')?.tier, 'hit');
});

// A long directory joined onto the name hides the name at the end of it, which is what
// `packages/ticket-widget/.env` does to `.env`. The two are read differently, so they are kept apart.
test('a file is labelled by its name, with only as much directory as it takes to tell it apart', () => {
  const built = view(session([], [], [
    touch('a', 'main', 'apps/web/.env', 'succeeded', 1),
    touch('b', 'main', 'packages/ticket-widget/.env', 'succeeded', 2),
    touch('c', 'main', 'apps/web/.env.production', 'succeeded', 3),
  ]));

  const labels = built.targets
    .filter((target) => target.kind === 'file')
    .map((target) => `${target.name} | ${target.context}`)
    .sort();

  assert.deepEqual(labels, ['.env | ticket-widget', '.env | web', '.env.production | ']);
});

// The first segment is what makes the label unique and the last is where the file sits; the middle is skipped.
test('a directory that is long in the middle is elided rather than dropped', () => {
  const built = view(session([], [], [
    touch('a', 'main', 'one/b/c/d/x/.env', 'succeeded', 1),
    touch('b', 'main', 'two/b/c/d/x/.env', 'succeeded', 2),
  ]));

  const contexts = built.targets.filter((target) => target.kind === 'file').map((target) => target.context).sort();

  assert.deepEqual(contexts, ['one/…/x', 'two/…/x']);
});
