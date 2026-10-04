// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { withLateMessage } from '../../src/core/late-message.ts';
import type { SessionModel } from '../../src/core/session-model.ts';

const agent = (agentId: string, record: number) => ({ source: { kind: 'agent' as const, agentId }, record });

const MODEL = {
  sessionId: 'sess',
  projectRoot: { kind: 'absent' },
  agents: [{ id: 'sess' }, { id: 'a1' }, { id: 'a2' }],
  delegations: [],
  events: [
    { agentId: 'a1', evidence: agent('a1', 3), result: { evidence: agent('a1', 5) } },
    { agentId: 'a2', evidence: agent('a2', 40), result: { evidence: agent('a2', 41) } },
  ],
  messages: [{ agentId: 'a1', kind: 'reasoning', text: 'thinking', evidence: agent('a1', 2) }],
  gaps: [],
  completeness: 'complete',
} as unknown as SessionModel;

test('last words not on disk are added after every record of that agent, and only that agent', () => {
  const model = withLateMessage(MODEL, 'a1', 'The value is here.');

  assert.deepEqual(model.messages.at(-1), { agentId: 'a1', kind: 'said', text: 'The value is here.', completeness: 'complete', evidence: agent('a1', 6) });
  assert.equal(model.messages.length, 2);
});

test('words already on disk, and empty words, leave the model as it was', () => {
  assert.equal(withLateMessage(MODEL, 'a1', 'thinking'), MODEL);
  assert.equal(withLateMessage(MODEL, 'a1', ''), MODEL);
});
