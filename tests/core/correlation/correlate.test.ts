// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { correlate } from '../../../src/core/correlation/correlate.ts';
import { mainSource } from '../../../src/core/evidence.ts';
import type { CallRecord, ResultRecord, SessionRecords } from '../../../src/core/session-records.ts';

const AGENT = 'main-agent';
const evidence = (record: number) => ({ source: mainSource(), record });

function call(id: string, overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    id,
    agentId: AGENT,
    sequence: 1,
    toolName: 'Read',
    input: {},
    targets: [],
    commands: [],
    resultShape: 'none',
    toolKnown: true,
    evidence: evidence(1),
    ...overrides,
  };
}

function result(callId: string, overrides: Partial<ResultRecord> = {}): ResultRecord {
  return { callId, stage: 'model', completeness: 'complete', evidence: evidence(2), ...overrides };
}

function records(overrides: Partial<SessionRecords> = {}): SessionRecords {
  return {
    sessionId: 'sess',
    provider: 'claude-code',
    agents: [{ id: AGENT, type: 'main', depth: 0 }],
    calls: [],
    results: [],
    delegations: [],
    delegationIndex: [],
    workingDirectories: [],
    messages: [],
    deliveredReports: [], agentReports: [],
    followUps: [],
    followUpIndex: [],
    turns: [],
    reviews: [],
    contexts: [],
    deliveries: [],
    capabilities: [],
    gaps: [],
    ...overrides,
  };
}

test('a call joins to its result by the call id, and that alone decides the outcome', () => {
  const model = correlate(records({ calls: [call('toolu_a')], results: [result('toolu_a', { content: 'ok' })] }));

  assert.equal(model.events.length, 1);
  assert.equal(model.events[0]?.outcome, 'succeeded');
  assert.equal(model.events[0]?.result?.content, 'ok');
  assert.equal(model.completeness, 'complete');
});

test('a recognised denial marker blocks, an unrecognised one is unknown and never blocked', () => {
  const model = correlate(
    records({
      calls: [call('toolu_a'), call('toolu_b')],
      results: [
        result('toolu_a', { denial: { kind: 'permission-rule', recognised: true, source: 'rule' } }),
        result('toolu_b', { denial: { kind: 'sandbox-rule', recognised: false } }),
      ],
    }),
  );

  assert.deepEqual(model.events.map((event) => event.outcome), ['blocked', 'unknown']);
  assert.ok(model.gaps.some((gap) => gap.kind === 'outcome-unrecognised'));
});

// who-stopped-it WS2: every known source is a call that did not run; who refused rides on the result, and an
// unrecognised marker names nobody.
test('a refusal says who refused, whichever of the three it was, and an unrecognised marker says nobody', () => {
  const model = correlate(
    records({
      calls: [call('toolu_a'), call('toolu_b'), call('toolu_c'), call('toolu_d')],
      results: [
        result('toolu_a', { denial: { kind: 'permission-rule', recognised: true, source: 'rule' } }),
        result('toolu_b', { denial: { kind: 'automode-blocked', recognised: true, source: 'reviewer' } }),
        result('toolu_c', { denial: { kind: 'declined', recognised: true, source: 'person' } }),
        result('toolu_d', { denial: { kind: 'sandbox-rule', recognised: false } }),
      ],
    }),
  );

  assert.deepEqual(model.events.map((event) => event.outcome), ['blocked', 'blocked', 'blocked', 'unknown']);
  assert.deepEqual(model.events.map((event) => event.result?.refusedBy), ['rule', 'reviewer', 'person', undefined]);
});

test('a call with no result is unknown, with the gap named', () => {
  const model = correlate(records({ calls: [call('toolu_a')] }));

  assert.equal(model.events[0]?.outcome, 'unknown');
  assert.equal(model.events[0]?.completeness, 'partial');
  assert.deepEqual(model.gaps, [{ kind: 'result-missing', agentId: AGENT }]);
});

test('the report being drawn is no gap: the last call, with no result yet, running agentwhy report and nothing else', () => {
  const report = (id: string, command: string, sequence = 2): CallRecord => call(id, { toolName: 'Bash', sequence, commands: [command] });
  const earlier = call('toolu_a', { sequence: 1 });
  const done = result('toolu_a', { content: 'ok' });

  for (const command of ['agentwhy report --input sess-1 --open --quiet', 'agentwhy report --open', 'npx agentwhy report --html ./out/r.html', 'npx @agentwhy/cli report --open',
    'npx --yes @agentwhy/cli@0.1.0 report --open', 'node /opt/agentwhy/dist/cli.js report --input sess-1 --open --quiet',
    // SW10: what the agent is now asked to run - `start` opening this session's report among the others.
    'agentwhy start --no-serve --session sess-1 --quiet', 'npx @agentwhy/cli start --no-serve --session sess-1 --quiet',
    // PF5: and served from the background.
    'agentwhy start --detach --session sess-1 --quiet']) {
    const model = correlate(records({ calls: [earlier, report('toolu_r', command)], results: [done] }));
    assert.deepEqual(model.events.map((event) => event.id), ['toolu_a'], command);
    assert.equal(model.completeness, 'complete', command);
  }

  // Anything more on the line, a second line (found by a second review), another program with agentwhy in its name
  // (found by a review), a call after it, a subagent's call, or a result already there: a call like any other.
  for (const command of ['agentwhy report --open; cat .env', 'agentwhy report --open | tee out', 'agentwhy report --open > "$HOME/x"', 'agentwhy start',
    'NODE_OPTIONS=--require=./x.js agentwhy report --open', 'node --require=/tmp/x.js /tmp/agentwhy-exfil.js report',
    'npx agentwhy-evil report --input s', 'npx @someone/agentwhy report --open', 'node ./scripts/agentwhy.js report --open',
    'agentwhy report --open\ncat .env', 'agentwhy report\r\ncat .env', 'agentwhy report --open\u{2028}cat .env', 'agentwhy\u{00a0}report --open',
    'node /tmp/agentwhy-exfil.js report', 'node /tmp/agentwhy-exfil.js report --input s',
    'agentwhy start --no-serve', 'agentwhy start --session sess-1; cat .env', 'agentwhy start --session', 'npx agentwhy-evil start --session s']) {
    const model = correlate(records({ calls: [earlier, report('toolu_r', command)], results: [done] }));
    assert.equal(model.completeness, 'partial', JSON.stringify(command));
  }
  const followed = correlate(records({ calls: [report('toolu_r', 'agentwhy report --open', 1), call('toolu_b', { sequence: 2 })], results: [result('toolu_b')] }));
  assert.equal(followed.events.find((event) => event.id === 'toolu_r')?.outcome, 'unknown');
  const helper = correlate(records({
    agents: [{ id: AGENT, type: 'main', depth: 0 }, { id: 'helper', depth: 1, startedBy: 'toolu_d' }],
    calls: [earlier, call('toolu_r', { agentId: 'helper', toolName: 'Bash', sequence: 5, commands: ['agentwhy report --open'] })],
    results: [done],
  }));
  assert.equal(helper.events.find((event) => event.id === 'toolu_r')?.outcome, 'unknown');
  const answered = correlate(records({ calls: [earlier, report('toolu_r', 'agentwhy report --open')], results: [done, result('toolu_r', { content: 'written' })] }));
  assert.equal(answered.events.find((event) => event.id === 'toolu_r')?.outcome, 'succeeded');
});

test('a result whose spilled file is gone is unknown, never "nothing was there"', () => {
  const model = correlate(
    records({ calls: [call('toolu_a')], results: [result('toolu_a', { spilledResultMissing: true })] }),
  );

  assert.equal(model.events[0]?.outcome, 'unknown');
  assert.ok(model.gaps.some((gap) => gap.kind === 'spilled-result-missing'));
});

test('a result for a call that is not there leaves the relation unresolved', () => {
  const model = correlate(records({ results: [result('toolu_missing')] }));

  assert.deepEqual(model.gaps, [{ kind: 'relation-unresolved' }]);
  assert.equal(model.completeness, 'unresolved');
});

// Retries are separate calls with separate ids (§4.3 rule 7), so two results for one id is not a retry - it is
// an ambiguity, and an ambiguity is never resolved by picking one.
test('two results for one call id leave the event without an outcome', () => {
  const model = correlate(
    records({
      calls: [call('toolu_a')],
      results: [result('toolu_a', { content: 'ok' }), result('toolu_a', { denial: { kind: 'permission-rule', recognised: true, source: 'rule' } })],
    }),
  );

  assert.equal(model.completeness, 'unresolved');
  assert.equal(model.events[0]?.outcome, 'unknown', 'picking the first would hand it an outcome it has not earned');
  assert.equal(model.events[0]?.completeness, 'unresolved');
  assert.equal(model.events[0]?.result, undefined, 'neither result can be said to be the one');
});

// The marker sits on the record. With two results in that record, marking both refused would report a call that
// succeeded as blocked - the wrong direction of error for this tool.
test('an outcome marker that cannot be attributed to one call leaves the outcome unresolved', () => {
  const model = correlate(
    records({
      calls: [call('toolu_a'), call('toolu_b')],
      results: [
        result('toolu_a', { content: 'ok', attributionAmbiguous: true }),
        result('toolu_b', { content: 'ok', attributionAmbiguous: true }),
      ],
    }),
  );

  assert.deepEqual(model.events.map((event) => event.outcome), ['unknown', 'unknown']);
  assert.equal(model.completeness, 'unresolved');
});

test('a second index entry for one delegation dissolves the join rather than picking one', () => {
  const model = correlate(
    records({
      calls: [call('toolu_agent', { toolName: 'Agent' })],
      delegations: [{ callId: 'toolu_agent', parentAgentId: AGENT, evidence: evidence(1) }],
      delegationIndex: [
        { callId: 'toolu_agent', agentId: 'a1', depth: 1 },
        { callId: 'toolu_agent', agentId: 'a2', depth: 2 },
      ],
    }),
  );

  assert.equal(model.delegations[0]?.childAgentId, undefined, 'neither agent can be said to be the one');
  assert.equal(model.delegations[0]?.depth, undefined);
  assert.equal(model.completeness, 'unresolved');
});

test('a delegation joins to the agent it started, carrying the depth the index stated', () => {
  const model = correlate(
    records({
      calls: [call('toolu_agent', { toolName: 'Agent' })],
      delegations: [{ callId: 'toolu_agent', parentAgentId: AGENT, prompt: 'find it', evidence: evidence(1) }],
      delegationIndex: [{ callId: 'toolu_agent', agentId: 'a1', requestedType: 'Explore', depth: 2 }],
    }),
  );

  assert.deepEqual(model.delegations, [
    {
      id: 'toolu_agent',
      parentAgentId: AGENT,
      childAgentId: 'a1',
      requestedType: 'Explore',
      depth: 2,
      prompt: 'find it',
      reports: [],
      followUps: [],
      evidence: evidence(1),
      completeness: 'complete',
    },
  ]);
});

test('a delegation with no index entry survives, with the relation marked unresolved', () => {
  const model = correlate(
    records({
      calls: [call('toolu_agent', { toolName: 'Agent' })],
      delegations: [{ callId: 'toolu_agent', parentAgentId: AGENT, prompt: 'find it', evidence: evidence(1) }],
    }),
  );

  assert.equal(model.delegations.length, 1, 'the delegation happened; only the agent it started is unknown');
  assert.equal(model.delegations[0]?.childAgentId, undefined);
  assert.equal(model.delegations[0]?.depth, undefined, 'depth is read, never inferred from the parent');
  assert.equal(model.delegations[0]?.completeness, 'unresolved');
});

test('an index entry for a delegation that is not there is unresolved too', () => {
  const model = correlate(records({ delegationIndex: [{ callId: 'toolu_gone', agentId: 'a1' }] }));

  assert.deepEqual(model.gaps, [{ kind: 'relation-unresolved', agentId: 'a1' }]);
});

test('the project root reaches the model from the records, and stays absent when none was recorded', () => {
  assert.deepEqual(correlate(records({ workingDirectories: ['/a/project'] })).projectRoot, {
    kind: 'known',
    path: '/a/project',
  });
  assert.deepEqual(correlate(records()).projectRoot, { kind: 'absent' });
});

// where-the-value-went R3 and R4: a delivered report joins the delegation its notification names, by that call's id
// and nothing else; a launch notice on a result reaches the event.
test('a delivered report joins the delegation it names, and one naming any other call joins nothing', () => {
  const model = correlate(
    records({
      calls: [call('toolu_agent', { toolName: 'Agent' }), call('toolu_bash', { toolName: 'Bash' })],
      results: [result('toolu_agent', { content: 'launched', launchNotice: true }), result('toolu_bash')],
      delegations: [{ callId: 'toolu_agent', parentAgentId: AGENT, evidence: evidence(1) }],
      delegationIndex: [{ callId: 'toolu_agent', agentId: 'a1', depth: 1 }],
      deliveredReports: [
        { callId: 'toolu_agent', content: 'first', evidence: evidence(5) },
        { callId: 'toolu_bash', content: 'a command finished', evidence: evidence(6) },
        { callId: 'toolu_agent', content: 'second', evidence: evidence(7) },
        { callId: 'toolu_elsewhere', content: 'no call of this session', evidence: evidence(8) },
      ],
    }),
  );

  assert.deepEqual(model.delegations[0]?.reports, [
    { content: 'first', evidence: evidence(5) },
    { content: 'second', evidence: evidence(7) },
  ]);
  assert.equal(model.events.find((event) => event.id === 'toolu_agent')?.result?.launchNotice, true);
  assert.equal(model.events.find((event) => event.id === 'toolu_bash')?.result?.launchNotice, undefined);
  assert.deepEqual(model.gaps, [], 'a notification naming no delegation is not a gap in the model; the doctor counts it');
});

// `2026-09-27-what-codex-wrote.md` X17, XD6: later words join the one delegation of their sender that started the agent
// they reached; one agent stays one delegation, and words that join nothing are kept, scanned, and said as a gap.
test('follow-ups join the delegation that started their agent, in order, and unjoined words stay as context', () => {
  const agents = [{ id: AGENT, type: 'main', depth: 0 }, { id: 'a1', depth: 1 }, { id: 'a2', depth: 1 }];
  const model = correlate(records({
    agents,
    calls: [call('call_spawn', { toolName: 'spawn_agent' })],
    results: [result('call_spawn', { content: 'started', launchNotice: true })],
    delegations: [{ callId: 'call_spawn', parentAgentId: AGENT, prompt: 'look around', evidence: evidence(1) }],
    delegationIndex: [{ callId: 'call_spawn', agentId: 'a1', recordedParentAgentId: AGENT }],
    followUps: [
      { callId: 'call_more', senderAgentId: AGENT, text: 'and the tests', evidence: evidence(4) },
      { callId: 'call_again', senderAgentId: AGENT, text: 'and the docs', evidence: evidence(6) },
      // Names an agent its sender never started.
      { callId: 'call_stranger', senderAgentId: AGENT, text: 'to someone else', evidence: evidence(7) },
      // Its index entry is doubled, so neither entry can be trusted.
      { callId: 'call_doubled', senderAgentId: AGENT, text: 'twice indexed', evidence: evidence(8) },
      // No index entry at all.
      { callId: 'call_lost', senderAgentId: AGENT, text: 'nobody', evidence: evidence(9) },
    ],
    followUpIndex: [
      { callId: 'call_more', agentId: 'a1' },
      { callId: 'call_again', agentId: 'a1' },
      { callId: 'call_stranger', agentId: 'a2' },
      { callId: 'call_doubled', agentId: 'a1' },
      { callId: 'call_doubled', agentId: 'a1' },
    ],
  }));

  assert.equal(model.delegations.length, 1, 'one agent, one delegation');
  assert.deepEqual(model.delegations[0]?.followUps, [
    { id: 'call_more', senderAgentId: AGENT, text: 'and the tests', evidence: evidence(4) },
    { id: 'call_again', senderAgentId: AGENT, text: 'and the docs', evidence: evidence(6) },
  ]);
  assert.deepEqual(model.contexts.map((context) => [context.kind, context.author, context.agentId, context.text]), [
    ['unjoined-instruction', 'agent', AGENT, 'to someone else'],
    ['unjoined-instruction', 'agent', AGENT, 'twice indexed'],
    ['unjoined-instruction', 'agent', AGENT, 'nobody'],
  ]);
  assert.equal(model.gaps.filter((gap) => gap.kind === 'relation-unresolved').length, 3);
  assert.equal(model.completeness, 'unresolved');
});

test('a started agent whose own record names another parent leaves the delegation without an agent', () => {
  const model = correlate(records({
    calls: [call('call_spawn', { toolName: 'spawn_agent' })],
    results: [result('call_spawn', { content: 'started' })],
    delegations: [{ callId: 'call_spawn', parentAgentId: AGENT, evidence: evidence(1) }],
    delegationIndex: [{ callId: 'call_spawn', agentId: 'a1', recordedParentAgentId: 'someone-else' }],
  }));

  assert.equal(model.delegations[0]?.childAgentId, undefined);
  assert.deepEqual(model.gaps, [{ kind: 'relation-unresolved', agentId: AGENT }]);
});

test('a turn recorded twice for one agent is kept by neither record, and a verdict keeps only a known turn', () => {
  const turn = (id: string, agentId: string, record: number) => ({ id, agentId, evidence: evidence(record) });
  const reviewer = { source: { kind: 'review' as const, reviewId: 'r1' }, record: 3 };
  const model = correlate(records({
    turns: [turn('t1', AGENT, 1), turn('t2', AGENT, 2), turn('t2', AGENT, 5), turn('t1', 'a1', 1)],
    reviews: [{
      id: 'r1', reviewedAgentId: AGENT, evidence: reviewer,
      verdicts: [
        { outcome: 'allowed', turnId: 't1', evidence: reviewer },
        { outcome: 'allowed', turnId: 't2', evidence: { ...reviewer, record: 4 } },
        { outcome: 'unrecognised', evidence: { ...reviewer, record: 5 } },
      ],
    }],
  }));

  assert.deepEqual(model.turns.map((each) => [each.agentId, each.id]), [[AGENT, 't1'], ['a1', 't1']], 'two agents may share a local id');
  assert.deepEqual(model.reviews[0]?.verdicts.map((verdict) => [verdict.outcome, verdict.turnId]), [
    ['allowed', 't1'], ['allowed', undefined], ['unrecognised', undefined],
  ]);
  assert.deepEqual(model.gaps, [
    { kind: 'relation-unresolved', agentId: AGENT },
    { kind: 'relation-unresolved', source: reviewer.source },
  ]);
});

test('capability records and texts that are not whole become gaps, and absent and unmeasured stay apart', () => {
  const model = correlate(records({
    calls: [call('exec_a', { toolName: 'shell', commands: ['cat .env'], resultShape: 'listing' })],
    results: [result('exec_a', { content: 'A=1', stage: 'execution', completeness: 'unknown', execution: { status: 'completed', exitCode: 0 } })],
    messages: [{ agentId: AGENT, kind: 'reasoning', text: 'summary', completeness: 'partial', evidence: evidence(3) }],
    deliveries: [{ recipientAgentId: AGENT, status: 'confirmed', text: 'A=1', completeness: 'complete', evidence: evidence(4) }],
    capabilities: [
      { question: 'actions', state: 'absent', source: mainSource(), agentId: AGENT },
      { question: 'refusals', state: 'unmeasured', source: mainSource(), agentId: AGENT },
      { question: 'own-words', state: 'supported', source: mainSource(), agentId: AGENT },
    ],
  }));

  assert.deepEqual(model.gaps, [
    { kind: 'result-incomplete', agentId: AGENT },
    { kind: 'result-incomplete', agentId: AGENT },
    { kind: 'capability-absent', question: 'actions', source: mainSource(), agentId: AGENT },
    { kind: 'capability-unmeasured', question: 'refusals', source: mainSource(), agentId: AGENT },
  ]);
  assert.equal(model.events[0]?.result?.stage, 'execution');
  assert.deepEqual(model.events[0]?.execution, { status: 'completed', exitCode: 0 });
  assert.equal(model.completeness, 'partial');
});

// X11: a recorded process status says something ran, never what it reached.
// Amended 2026-10-05: a search exits 1 where it matched nothing - recorded as failed - having opened every operand; 2 or
// more where one could not be read. A search whose exit is not documented here establishes nothing.
test('a recorded execution establishes access only for a writer that completed, one reader that exited 0, or one search that exited 0 or 1', () => {
  const shell = (id: string, command: string) => call(id, { toolName: 'shell', commands: [command], resultShape: 'listing' });
  const ran = (id: string, status: 'completed' | 'failed' | 'interrupted' | 'unrecognised', exitCode?: number) =>
    result(id, { content: 'x', stage: 'execution', completeness: 'unknown', execution: { status, ...(exitCode === undefined ? {} : { exitCode }) } });
  const model = correlate(records({
    calls: [
      shell('read', 'cat .env'), shell('failed', 'cat .env'), shell('two', 'cat .env && cat b'), shell('grep', 'grep KEY .env'),
      shell('interrupted', 'cat .env'), shell('odd', 'cat .env'),
      shell('grep-none', 'grep KEY .env'), shell('grep-error', 'grep KEY .env'), shell('rg-none', 'rg -n KEY .env'),
      shell('rg-then', 'rg KEY .env || true'), shell('ag', 'ag KEY .env'),
      call('write', { toolName: 'change', targets: ['a.txt'], written: ['hello'] }),
      call('write-failed', { toolName: 'change', targets: ['a.txt'] }),
      call('unknown-shape', { toolName: 'shell', toolKnown: false, commands: [] }),
    ],
    results: [
      ran('read', 'completed', 0), ran('failed', 'failed', 1), ran('two', 'completed', 0), ran('grep', 'completed', 0),
      ran('interrupted', 'interrupted'), ran('odd', 'unrecognised', 0),
      ran('grep-none', 'failed', 1), ran('grep-error', 'failed', 2), ran('rg-none', 'failed', 1), ran('rg-then', 'completed', 0), ran('ag', 'failed', 1),
      ran('write', 'completed'), ran('write-failed', 'failed'), ran('unknown-shape', 'completed', 0),
    ],
  }));
  const outcomes = Object.fromEntries(model.events.map((event) => [event.id, event.outcome]));

  assert.deepEqual(outcomes, {
    read: 'succeeded', failed: 'unknown', two: 'unknown', grep: 'succeeded', interrupted: 'unknown', odd: 'unknown',
    'grep-none': 'succeeded', 'grep-error': 'unknown', 'rg-none': 'succeeded', 'rg-then': 'unknown', ag: 'unknown',
    write: 'succeeded', 'write-failed': 'unknown', 'unknown-shape': 'unknown',
  });
  assert.deepEqual(model.gaps.filter((gap) => gap.kind === 'outcome-unrecognised'), [{ kind: 'outcome-unrecognised', agentId: AGENT }]);
});

// Codex reads a file with `sed -n '1,200p' FILE` more often than with `cat`: a lone operand of a `sed` that exited 0 was read.
test('a sed given one file, or nl, that exited 0 read it; a sed given two, -i or --help establishes nothing', () => {
  const lines: Readonly<Record<string, string>> = {
    sed: "sed -n '1,200p' .env", script: "sed -n -e '1,200p' .env", nl: 'nl -ba .env',
    two: "sed -n '1,200p' .env b", 'two-scripted': 'sed -e 1p .env b', 'in-place': "sed -i '' s/a/b/ .env", help: 'sed --help .env',
    'no-file': 'sed -n 1p', piped: "cat .env | sed -n '1,200p'",
  };
  const model = correlate(records({
    calls: Object.entries(lines).map(([id, line]) => call(id, { toolName: 'shell', commands: [line], resultShape: 'listing' })),
    results: Object.keys(lines).map((id) =>
      result(id, { content: 'x', stage: 'execution', completeness: 'unknown', execution: { status: 'completed', exitCode: 0 } })),
  }));

  assert.deepEqual(Object.fromEntries(model.events.map((event) => [event.id, event.outcome])), {
    sed: 'succeeded', script: 'succeeded', nl: 'succeeded',
    two: 'unknown', 'two-scripted': 'unknown', 'in-place': 'unknown', help: 'unknown', 'no-file': 'unknown', piped: 'unknown',
  });
});
