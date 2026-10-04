// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { ClaudeCodeSessionDiscovery } from '../../../src/adapter/claude-code/discovery/claude-code-session-discovery.ts';
import { ClaudeCodeSessionSource } from '../../../src/adapter/claude-code/events/claude-code-session-source.ts';
import { protectedAccesses } from '../../../src/core/access/protected-access.ts';
import { protectedValues } from '../../../src/core/access/protected-values.ts';
import { returnsOf, traceValues, type DelegationReturn } from '../../../src/core/access/returns.ts';
import { mainSource } from '../../../src/core/evidence.ts';
import type { ToolEvent } from '../../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../../src/core/policy/default-policy.ts';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../../src/core/session-model.ts';
import { NodeFileSystem } from '../../../src/infrastructure/node-file-system.ts';
import { RETURN_SESSION_ID, returnSessionFiles, type ReturnSessionOptions } from '../../helpers/return-session.ts';
import { writeSession } from '../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
const source = new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files });
const SEARCHED = 'apps/web/.env.development';

async function returnsIn(
  t: Parameters<typeof writeSession>[0],
  options: ReturnSessionOptions,
): Promise<{ model: SessionModel; returns: DelegationReturn[] }> {
  const root = await writeSession(t, returnSessionFiles(options));
  const model = await source.read(join(root, `${RETURN_SESSION_ID}.jsonl`));
  const redactor = new Redactor('test');
  const accesses = protectedAccesses(model, DEFAULT_POLICY);
  return { model, returns: returnsOf(model, accesses, traceValues(model, accesses, (values) => redactor.trace(values))) };
}

const said = (returns: readonly DelegationReturn[]) =>
  returns.map(({ strength, paths, filesReached }) => ({ strength, paths, filesReached }));

// what-came-back criteria 2 and 3: the motivating case, whole and as the fragment that actually leaked.
test('the whole value, or a prefix and a suffix of it, in what came back is a value that came back', async (t) => {
  for (const carried of ['value', 'fragment'] as const) {
    const { returns } = await returnsIn(t, { carried });

    assert.deepEqual(said(returns), [{ strength: 'value', paths: [SEARCHED], filesReached: 2 }], carried);
  }
});

// Criterion 4.
test('only the path is a path that came back, and nothing is a report of the length of what came back', async (t) => {
  const path = await returnsIn(t, { carried: 'path' });
  const nothing = await returnsIn(t, { carried: 'nothing' });
  const result = nothing.model.events.find((event) => event.id === nothing.returns[0]?.delegationId)?.result;

  assert.deepEqual(said(path.returns), [{ strength: 'path', paths: [SEARCHED], filesReached: 2 }]);
  assert.deepEqual(said(nothing.returns), [{ strength: 'report', paths: [], filesReached: 2 }]);
  // What came back, not what the agent wrote: the two differ, and only one of them reached the session (R2).
  assert.equal(nothing.returns[0]?.reportLength, result?.content?.length);
});

// Contract v10 / `when-an-agent-finishes` D9. The gap it closed: a subagent that hands its report back through a
// `SubagentHandback` call, rather than writing it as a message, was read by nothing. What came back was then measured
// on the delegating result alone, which carries none of the file - so a value that did reach the agent that
// delegated was reported as never having left the one that read it. The whole of a leak, called clean.
test('a report handed back through a call is what came back, not the empty result beside it', async (t) => {
  const handed = await returnsIn(t, { carried: 'value', handback: true });
  const clean = await returnsIn(t, { carried: 'nothing', handback: true });

  assert.deepEqual(said(handed.returns), [{ strength: 'value', paths: [SEARCHED], filesReached: 2 }]);
  assert.equal(handed.returns[0]?.inferred, undefined, 'read out of the reply, not inferred from where it turned up');
  // And the same route still says "nothing came back" when the report really carries nothing of the file.
  assert.deepEqual(said(clean.returns), [{ strength: 'report', paths: [], filesReached: 2 }]);
});

// A reply this version cannot read is not a clean reply. Whatever carried it, a child's one channel to its parent is
// its reply, so a value only an agent below ever read, in the hands of the agent that delegated, crossed here.
test('a value in the hands of the agent that delegated is not a return that carried nothing', async (t) => {
  const crossed = await returnsIn(t, { carried: 'nothing', parentWrites: true });
  const quiet = await returnsIn(t, { carried: 'nothing', resultCarries: 'nothing' });

  assert.deepEqual(said(crossed.returns), [{ strength: 'value', paths: [SEARCHED], filesReached: 2 }]);
  assert.equal(crossed.returns[0]?.inferred, true, 'and it is said as forced, never as a reply that was read');
  // The backstop only fires on a contradiction: where nothing crossed, nothing is claimed.
  assert.deepEqual(said(quiet.returns), [{ strength: 'report', paths: [], filesReached: 2 }]);
  assert.equal(quiet.returns[0]?.inferred, undefined);
});

// Criteria 5 and 6: prose is not access, and a port is not a secret.
test('an ordinary value, or a protected path nobody reached, is not what came back', async (t) => {
  for (const carried of ['ordinary', 'unreached'] as const) {
    const { returns } = await returnsIn(t, { carried });

    assert.deepEqual(said(returns), [{ strength: 'report', paths: [], filesReached: 2 }], carried);
  }
});

// Criterion 7 (R8).
test('a value that travelled two hops is stated at each hop, each to the agent it came back to', async (t) => {
  const { model, returns } = await returnsIn(t, { carried: 'value', nested: true });

  assert.deepEqual(returns.map((entry) => entry.strength), ['value', 'value']);
  assert.equal(returns[0]?.parentAgentId, model.sessionId, 'the first hop comes back to the session');
  assert.equal(returns[1]?.parentAgentId, returns[0]?.agentId, 'the second to the agent that delegated again');
});

// R4b, as measured: the agent wrote the whole value, and the result carried no run of it.
test('a value only in the agent\'s own messages is written there, and is not a value that came back', async (t) => {
  const { returns } = await returnsIn(t, { carried: 'value', resultCarries: 'nothing' });

  assert.deepEqual(said(returns), [{ strength: 'report', paths: [], filesReached: 2 }]);
  assert.deepEqual(returns[0]?.writtenFrom, [SEARCHED]);
});

// Criterion 8 (R9).
test('a delegating call with no result has an unknown return, whatever its agent wrote', async (t) => {
  const { returns } = await returnsIn(t, { carried: 'value', resultMissing: true });

  assert.deepEqual(said(returns), [{ strength: 'unknown', paths: [], filesReached: 2 }]);
});

const evidence = (record: number) => ({ source: mainSource(), record });

function event(id: string, overrides: Partial<ToolEvent>): ToolEvent {
  return {
    id, agentId: 'a1', sequence: 1, toolName: 'Bash', input: {}, targets: [], commands: [], resultShape: 'none',
    toolKnown: true, outcome: 'succeeded', evidence: evidence(1), completeness: 'complete', ...overrides,
  };
}

// R3: where values come from, and where they do not.
test('values come from what a protected read printed and from listing lines naming the path, and nowhere else', () => {
  const model: SessionModel = {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 's', projectRoot: { kind: 'absent' }, agents: [], delegations: [], messages: [], gaps: [], completeness: 'complete',
    events: [
      event('read', {
        toolName: 'Read', targets: ['apps/web/.env'], resultShape: 'content',
        result: { stage: 'model', completeness: 'complete', content: '     1→API_TOKEN=first-value-1234\n     2→# a comment\n     3→"db_password": "second-value-5678"', evidence: evidence(2) },
      }),
      event('grep', {
        commands: ['grep -rn TOKEN apps'], resultShape: 'listing',
        result: { stage: 'model', completeness: 'complete', content: 'apps/web/.env.local:4:OTHER_TOKEN=third-value-9012\nsrc/app.ts:9:const token = readToken()', evidence: evidence(3) },
      }),
    ],
  };

  assert.deepEqual(
    protectedValues(model, protectedAccesses(model, DEFAULT_POLICY)).map(({ paths, value }) => [paths, value]),
    [
      [['apps/web/.env'], 'first-value-1234'],
      [['apps/web/.env'], 'second-value-5678'],
      [['apps/web/.env.local'], 'third-value-9012'],
    ],
  );
});

/*
 * said-where-the-person-is SWB4, SWO1: the value the agent read through `cd … && ls -la && cat .env` and then wrote back
 * was never traced - `cd` and `ls` made the output a listing. `cd` prints nothing; beside `ls`, only a `KEY=value`
 * line is the file's, so no name `ls` printed becomes a value.
 */
test('a file printed beside a directory listing gives its KEY=value lines, and no name ls printed', () => {
  const listing = ['total 16', 'drwxr-xr-x  4 someone  staff  128 Oct  2 10:00 .', '-rw-r--r--  1 someone  staff   42 Oct  2 10:00 .env',
    '-rw-r--r--  1 someone  staff  310 Oct  2 10:00 package.json', 'src:'].join('\n');
  const model: SessionModel = {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 's', projectRoot: { kind: 'absent' }, agents: [], delegations: [], messages: [], gaps: [], completeness: 'complete',
    events: [
      event('both', {
        commands: ['cd apps/web && ls -la && cat .env'], resultShape: 'listing',
        result: { stage: 'model', completeness: 'complete', content: `${listing}\nAPI_TOKEN=first-value-1234\n# a comment`, evidence: evidence(2) },
      }),
      event('cd', {
        commands: ['cd apps/api && cat .env.local'], resultShape: 'listing',
        result: { stage: 'model', completeness: 'complete', content: 'second-value-5678', evidence: evidence(3) },
      }),
    ],
  };

  assert.deepEqual(
    protectedValues(model, protectedAccesses(model, DEFAULT_POLICY)).map(({ paths, value }) => [paths, value]),
    [
      [['.env'], 'first-value-1234'],
      [['.env.local'], 'second-value-5678'],
    ],
  );
});

/*
 * Seen by the maintainer on 2026-10-02: `cat fake-key.txt || find . -name fake-key.txt` in one line printed the key,
 * and `find` beside `cat` made the whole output a listing - "no value found" over a value in the chat. `find` prints
 * names, as `ls` does, so the KEY=value line is the file's.
 */
test('a file printed beside a find gives its KEY=value lines', () => {
  const model: SessionModel = {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 's', projectRoot: { kind: 'absent' }, agents: [], delegations: [], messages: [], gaps: [], completeness: 'complete',
    events: [
      event('both', {
        commands: ['cat fake-key.txt 2>/dev/null || find . -name fake-key.txt -maxdepth 2'], resultShape: 'listing',
        result: { stage: 'model', completeness: 'complete', content: 'TEST_KEY=first-value-1234', evidence: evidence(2) },
      }),
    ],
  };
  const policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/fake-key.txt', mode: 'tell' as const }] };

  assert.deepEqual(
    protectedValues(model, protectedAccesses(model, policy)).map(({ paths, value }) => [paths, value]),
    [[['fake-key.txt'], 'first-value-1234']],
  );
});

// docs/detection.md `npmrc`: a registry-scoped setting gives its value, not the whole line taken for an address.
test('a registry token in .npmrc is read as the value of its setting', () => {
  const model: SessionModel = {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 's', projectRoot: { kind: 'absent' }, agents: [], delegations: [], messages: [], gaps: [], completeness: 'complete',
    events: [
      event('cat', {
        commands: ['cat ~/.npmrc'],
        result: { stage: 'model', completeness: 'complete', content: '//registry.npmjs.org/:_authToken=first-value-1234\nsave-exact=true', evidence: evidence(2) },
      }),
    ],
  };

  assert.deepEqual(
    protectedValues(model, protectedAccesses(model, DEFAULT_POLICY)).map(({ paths, value }) => [paths, value]),
    [
      [['~/.npmrc'], 'first-value-1234'],
      [['~/.npmrc'], 'true'],
    ],
  );
});

// R4 names the file a value came from, and a call that printed two of them at once does not say which.
test('a call that printed several protected files reads each value once, against all of them', () => {
  const model: SessionModel = {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 's', projectRoot: { kind: 'absent' }, agents: [], delegations: [], messages: [], gaps: [], completeness: 'complete',
    events: [
      event('cat', {
        commands: ['cat apps/web/.env apps/web/.env.local'],
        result: { stage: 'model', completeness: 'complete', content: 'FIRST_SECRET=first-value-1234\nSECOND_SECRET=second-value-5678', evidence: evidence(2) },
      }),
    ],
  };

  assert.deepEqual(
    protectedValues(model, protectedAccesses(model, DEFAULT_POLICY)).map(({ paths, value }) => [paths, value]),
    [
      [['apps/web/.env', 'apps/web/.env.local'], 'first-value-1234'],
      [['apps/web/.env', 'apps/web/.env.local'], 'second-value-5678'],
    ],
  );
});

// where-the-value-went R3 and criterion 3: the motivating case as its transcript records it - a launch notice, then
// the report delivered on a line of its own. What was received decides, and the statement points at the delivery.
test('a value in a report delivered after a launch notice came back, with the record of the delivery', async (t) => {
  const { returns } = await returnsIn(t, { carried: 'value', background: 'delivered' });

  assert.deepEqual(said(returns), [{ strength: 'value', paths: [SEARCHED], filesReached: 2 }]);
  assert.equal(returns[0]?.evidence.record, 4, 'the call, the notice, the queued line, then the delivery');
  assert.equal(returns[0]?.awaited, undefined);
});

// Criteria 2 and 4, and R5: a queued line is not a delivery, and a notice with none is not a clean return.
test('a report only queued, or never delivered, after a launch notice leaves the return unknown and awaited', async (t) => {
  for (const background of ['queued', 'awaited'] as const) {
    const { returns } = await returnsIn(t, { carried: 'value', background });

    assert.deepEqual(said(returns), [{ strength: 'unknown', paths: [], filesReached: 2 }], background);
    assert.equal(returns[0]?.awaited, true, background);
    assert.deepEqual(returns[0]?.writtenFrom, [SEARCHED], 'what the agent wrote is still said as written');
  }
});

// R6: the size of what came back is the size of what was delivered, never of the notice.
test('a report delivered late is sized by the delivery, and a path it names is a path that came back', async (t) => {
  const nothing = await returnsIn(t, { carried: 'nothing', background: 'delivered' });
  const path = await returnsIn(t, { carried: 'path', background: 'delivered' });

  assert.deepEqual(said(nothing.returns), [{ strength: 'report', paths: [], filesReached: 2 }]);
  assert.equal(nothing.returns[0]?.reportLength, nothing.model.delegations[0]?.reports[0]?.content.length);
  assert.deepEqual(said(path.returns), [{ strength: 'path', paths: [SEARCHED], filesReached: 2 }]);
});

// docs/detection.md `python-open` and its control `python-checks-exists`.
test('an interpreter that opened a named file gives its output as values; one that only asked about it gives none', () => {
  const run = (command: string, content: string) => {
    const model: SessionModel = {
      provider: 'claude-code',
      turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
      sessionId: 's', projectRoot: { kind: 'absent' }, agents: [], delegations: [], messages: [], gaps: [], completeness: 'complete',
      events: [event('py', { commands: [command], result: { stage: 'model', completeness: 'complete', content, evidence: evidence(2) } })],
    };
    const accesses = protectedAccesses(model, DEFAULT_POLICY);
    return traceValues(model, accesses, (values) => new Redactor('test').trace(values)).values.map(({ paths, value }) => [paths, value]);
  };

  assert.deepEqual(run(`python3 -c "print(open('.env').read())"`, 'API_KEY=first-value-1234'), [[['.env'], 'first-value-1234']]);
  assert.deepEqual(run(`python3 -c "import os; print(os.path.exists('.env'))"`, 'True'), [], 'a boolean is an ordinary value');
});
