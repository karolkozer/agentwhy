// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { nextLandings } from '../../../src/core/access/next-landings.ts';
import { landingsOf } from '../../../src/core/access/uses.ts';
import type { ToolEvent } from '../../../src/core/event.ts';
import type { SessionModel } from '../../../src/core/session-model.ts';

// `2026-10-19-what-it-did-next.md` DN3: every way an agent put anything on after a record of its own stream.
const at = (agentId: string, record: number) => ({ source: agentId === 'main' ? { kind: 'main' as const } : { kind: 'agent' as const, agentId }, record });

function event(id: string, agentId: string, record: number, fields: Partial<ToolEvent>): ToolEvent {
  return {
    id, agentId, sequence: record, toolName: 'Bash', input: {}, targets: [], commands: [], resultShape: 'none', toolKnown: true,
    outcome: 'succeeded', evidence: at(agentId, record), completeness: 'complete', ...fields,
  };
}

const MODEL: SessionModel = {
  provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
  sessionId: 'main', projectRoot: { kind: 'absent' }, completeness: 'complete', gaps: [],
  agents: [{ id: 'main', type: 'main', depth: 0 }, { id: 'helper', depth: 1 }],
  delegations: [{
    followUps: [], id: 'task', parentAgentId: 'main', childAgentId: 'helper', description: 'Look', prompt: 'p', reports: [],
    evidence: at('main', 4), completeness: 'complete',
  }],
  messages: [
    { agentId: 'main', kind: 'said', text: 'Starting.', completeness: 'complete', evidence: at('main', 1) },
    { agentId: 'main', kind: 'reasoning', text: 'Now the files.', completeness: 'complete', evidence: at('main', 6) },
  ],
  events: [
    event('task', 'main', 4, { toolName: 'Agent', input: { prompt: 'p' } }),
    event('ls', 'main', 7, { input: { command: 'ls' }, commands: ['ls'] }),
    event('write', 'helper', 2, { toolName: 'Write', targets: ['notes.md'], written: ['text'] }),
    event('mcp', 'helper', 3, { toolName: 'mcp__notes__save', input: { note: 'x' } }),
  ],
};

test('the ways an agent took after a record, whatever they hold, by its own records alone', () => {
  const landings = landingsOf(MODEL, []);

  assert.deepEqual(nextLandings(MODEL, landings, 'main', 3), ['command', 'delegation', 'reasoning']);
  assert.deepEqual(nextLandings(MODEL, landings, 'main', 6), ['command'], 'a record at the read itself is not after it');
  assert.deepEqual(nextLandings(MODEL, landings, 'main', 7), [], 'nothing after its last record');
});

test('a helper’s reply is a way on from it, after anything it read', () => {
  const landings = landingsOf(MODEL, []);

  assert.deepEqual(nextLandings(MODEL, landings, 'helper', 0), ['call', 'file', 'reply']);
  assert.deepEqual(nextLandings(MODEL, landings, 'helper', 9), ['reply'], 'its reply comes last of all');
});
