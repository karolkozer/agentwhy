import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mainSource } from '../../../src/core/evidence.ts';
import type { ToolEvent } from '../../../src/core/event.ts';
import type { AgentMessage, MessageKind } from '../../../src/core/message.ts';
import type { SessionModel } from '../../../src/core/session-model.ts';
import { wordsBeforeCalls } from '../../../src/core/access/words-before.ts';

const evidence = (record: number) => ({ source: mainSource(), record });

function call(id: string, record: number, agentId = 'main'): ToolEvent {
  return {
    id, agentId, sequence: record, toolName: 'Bash', input: {}, targets: [], commands: [], resultShape: 'none',
    toolKnown: true, outcome: 'succeeded', evidence: evidence(record), completeness: 'complete',
  };
}

const wrote = (record: number, kind: MessageKind, text: string, agentId = 'main'): AgentMessage => ({
  agentId, kind, text, completeness: 'complete', evidence: evidence(record),
});

function model(events: readonly ToolEvent[], messages: readonly AgentMessage[]): SessionModel {
  return {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [], delegations: [],
    events, messages, gaps: [], completeness: 'complete',
  };
}

const said = (before: ReturnType<typeof wordsBeforeCalls>, id: string) => {
  const found = before.get(id);
  return { words: found?.words.map((message) => [message.kind, message.text]) ?? [], covers: found?.covers };
};

// why-this-call R2 and R4: the words are the agent's own, in the order written, on the line before the call.
test('what an agent wrote before a call is attached to it, both kinds, in order', () => {
  const before = wordsBeforeCalls(
    model([call('one', 3)], [wrote(2, 'reasoning', 'the secret must be in an env file'), wrote(2, 'said', 'Looking for it.')]),
  );

  assert.deepEqual(said(before, 'one'), {
    words: [['reasoning', 'the secret must be in an env file'], ['said', 'Looking for it.']],
    covers: 1,
  });
});

// R2: one block stood before four calls ten times in the measured session. Attaching it to the first would be false.
test('one block before a run of calls belongs to the whole run, and the run says how many', () => {
  const before = wordsBeforeCalls(
    model([call('one', 3), call('two', 4), call('three', 5)], [wrote(2, 'reasoning', 'check the three of them')]),
  );

  for (const id of ['one', 'two', 'three']) {
    assert.deepEqual(said(before, id), { words: [['reasoning', 'check the three of them']], covers: 3 });
  }
});

// R3: 186 of 462 calls follow another call directly. An absence is reported, never filled in from the run before.
test('a call that follows writing of its own does not inherit the words of the run before it', () => {
  const before = wordsBeforeCalls(
    model(
      [call('one', 2), call('two', 4)],
      [wrote(1, 'reasoning', 'first, the search'), wrote(3, 'reasoning', 'now read what it found')],
    ),
  );

  assert.deepEqual(said(before, 'one'), { words: [['reasoning', 'first, the search']], covers: 1 });
  assert.deepEqual(said(before, 'two'), { words: [['reasoning', 'now read what it found']], covers: 1 });
});

test('a call with nothing written before it carries nothing, and says so by having nothing', () => {
  const before = wordsBeforeCalls(model([call('one', 1), call('two', 2)], []));

  assert.deepEqual(said(before, 'one'), { words: [], covers: 2 });
  assert.deepEqual(said(before, 'two'), { words: [], covers: 2 });
});

// Each agent is read on its own records: a subagent's line 2 is not the session's line 2.
test('agents do not borrow each other words', () => {
  const before = wordsBeforeCalls(
    model(
      [call('main-call', 2), call('agent-call', 2, 'a1')],
      [wrote(1, 'reasoning', 'what the session thought'), wrote(1, 'said', 'what the agent said', 'a1')],
    ),
  );

  assert.deepEqual(said(before, 'main-call'), { words: [['reasoning', 'what the session thought']], covers: 1 });
  assert.deepEqual(said(before, 'agent-call'), { words: [['said', 'what the agent said']], covers: 1 });
});
