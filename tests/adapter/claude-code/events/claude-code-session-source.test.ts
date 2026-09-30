import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaudeCodeSessionSource } from '../../../../src/adapter/claude-code/events/claude-code-session-source.ts';
import { ClaudeCodeSessionDiscovery } from '../../../../src/adapter/claude-code/discovery/claude-code-session-discovery.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import type { Counts } from '../../../../src/shared/counter.ts';
import { FaultyFileSystem } from '../../../helpers/faulty-file-system.ts';
import { ONWARD_SECRET, ONWARD_SESSION_ID, onwardSessionFiles } from '../../../helpers/onward-session.ts';
import { loadOracle } from '../../../helpers/oracle.ts';
import { jsonl, writeSession } from '../../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
const source = new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files });
const oracle = loadOracle();

function fixture(path: string): string {
  return fileURLToPath(new URL(`../../../fixtures/${path}`, import.meta.url));
}

function read(path: string): Promise<SessionModel> {
  return source.read(fixture(path));
}

function toolCounts(model: SessionModel, ofMainAgent: boolean): Counts {
  const counts: Record<string, number> = {};
  for (const event of model.events) {
    if ((event.agentId === model.sessionId) !== ofMainAgent) continue;
    counts[event.toolName] = (counts[event.toolName] ?? 0) + 1;
  }
  return counts;
}

const CORPUS = `redacted/${oracle.source.sessionId}`;

// The assertion table of the parent plan, on the committed corpus.

test('the corpus yields 15 delegations, each with a prompt, a type and a depth', async () => {
  const model = await read(CORPUS);

  assert.equal(model.delegations.length, 15);
  for (const delegation of model.delegations) {
    assert.ok(delegation.prompt !== undefined && delegation.prompt.length > 0, delegation.id);
    assert.ok(delegation.requestedType !== undefined, delegation.id);
    assert.ok(delegation.depth !== undefined, delegation.id);
    assert.ok(delegation.childAgentId !== undefined, 'every delegation joins to the agent it started');
  }
  assert.deepEqual(
    [...new Set(model.delegations.map((delegation) => delegation.depth))],
    [1],
    'this session has no nesting',
  );
});

test('the corpus yields 5 blocked events, 2 in the session and 3 in subagents', async () => {
  const model = await read(CORPUS);
  const blocked = model.events.filter((event) => event.outcome === 'blocked');

  assert.equal(blocked.length, 5);
  assert.equal(blocked.filter((event) => event.agentId === model.sessionId).length, 2);
  assert.equal(blocked.filter((event) => event.agentId !== model.sessionId).length, 3);
});

test('the corpus leaves no relation unresolved and no call unanswered', async () => {
  const model = await read(CORPUS);

  assert.deepEqual(model.gaps, [], 'a complete session has nothing to report as missing');
  assert.equal(model.completeness, 'complete');
  assert.equal(model.events.filter((event) => event.outcome === 'unknown').length, 0);
});

test('the corpus yields one event per call, and the tool counts of the oracle', async () => {
  const model = await read(CORPUS);
  const { relations } = oracle;

  assert.equal(model.events.length, Number(relations.toolUseBlocksMain) + Number(relations.toolUseBlocksSubagents));
  assert.deepEqual(toolCounts(model, true), oracle.tools.main);
  assert.deepEqual(toolCounts(model, false), oracle.tools.subagents);
  assert.equal(model.agents.length, 16, 'the session itself plus its 15 subagents');
});

test('every agent of the corpus is the one its delegation named', async () => {
  const model = await read(CORPUS);

  for (const delegation of model.delegations) {
    const agent = model.agents.find((candidate) => candidate.id === delegation.childAgentId);
    assert.ok(agent !== undefined, delegation.id);
    assert.equal(agent.startedBy, delegation.id);
    assert.equal(agent.type, delegation.requestedType);
  }
});

// The cases the redacted corpus does not contain.

test('a truncated record is a named gap, and the events around it survive', async () => {
  const model = await read('synthetic/truncated-transcript/synthetic-truncated');

  assert.equal(model.completeness, 'partial');
  assert.deepEqual(model.gaps, [{ kind: 'record-damaged', agentId: model.sessionId }]);
});

test('a nested delegation hangs off the agent that made it, not off the session', async () => {
  const model = await read('synthetic/nested-delegation/synthetic-nested');
  const [outer, inner] = [
    model.delegations.find((delegation) => delegation.parentAgentId === model.sessionId),
    model.delegations.find((delegation) => delegation.parentAgentId !== model.sessionId),
  ];

  assert.equal(model.delegations.length, 2);
  assert.equal(outer?.depth, 2, 'the depth the index states, not one counted down the tree');
  assert.equal(outer?.childAgentId, 'a1111111111111111');
  assert.equal(inner?.parentAgentId, 'a1111111111111111', 'the nested delegation belongs to the subagent');
  assert.equal(inner?.completeness, 'unresolved', 'its own agent was never indexed');

  const nestedCall = model.events.find((event) => event.id === inner?.id);
  assert.equal(nestedCall?.outcome, 'unknown', 'a call with no result is unknown, never assumed to have worked');
  assert.ok(model.gaps.some((gap) => gap.kind === 'result-missing'));
});

test('a delegation whose transcript is missing keeps the delegation and loses only its actions', async () => {
  const model = await read('synthetic/missing-subagent-transcript/synthetic-missing-transcript');

  assert.equal(model.delegations.length, 1);
  assert.equal(model.delegations[0]?.childAgentId, 'a2222222222222222');
  assert.equal(model.events.filter((event) => event.agentId === 'a2222222222222222').length, 0);
  assert.deepEqual(model.gaps, [{ kind: 'source-missing', agentId: 'a2222222222222222' }]);
});

test('a result pointing at a spilled file that is gone is unknown, not a quiet success', async () => {
  const model = await read('synthetic/missing-spilled-result/synthetic-missing-spill');

  assert.equal(model.events.length, 1);
  assert.equal(model.events[0]?.outcome, 'unknown');
  assert.ok(model.gaps.some((gap) => gap.kind === 'spilled-result-missing'));
});

test('an unknown denial kind is unknown, never blocked', async () => {
  const model = await read('synthetic/unknown-denial-kind/synthetic-unknown-denial');

  assert.equal(model.events[0]?.outcome, 'unknown');
  assert.equal(model.events[0]?.result?.denialKind, 'sandbox-rule', 'the value is kept, not mapped to a known one');
});

// The invariant of architecture note 3, as a test that can fail. The model holds no timestamp at all, so
// reversing every one of them must change nothing. It guards against a later change that starts ordering or
// joining by time - which is silently wrong exactly when agents run in parallel, the normal case here.
test('reversing every timestamp changes nothing in the model', async (t) => {
  const stamped = (at: string, record: object) => ({ ...record, timestamp: at });
  const session = (times: readonly string[]) => ({
    'shuffled.jsonl': jsonl(
      stamped(times[0] ?? '', {
        type: 'assistant',
        isSidechain: false,
        uuid: '11111111-1111-4111-8111-111111111111',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu_01TIMEAAAAAAAAAAAAAAAAAA', name: 'Read', input: { file_path: '/a' } },
          ],
        },
      }),
      stamped(times[1] ?? '', {
        type: 'user',
        isSidechain: false,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_01TIMEAAAAAAAAAAAAAAAAAA', content: 'first' }],
        },
      }),
      stamped(times[2] ?? '', {
        type: 'assistant',
        isSidechain: false,
        uuid: '22222222-2222-4222-8222-222222222222',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_01TIMEBBBBBBBBBBBBBBBBBB', name: 'Bash', input: { command: 'ls' } }],
        },
      }),
    ),
  });
  const ascending = await writeSession(t, session(['2026-09-13T10:00:00Z', '2026-09-13T10:00:01Z', '2026-09-13T10:00:02Z']));
  const descending = await writeSession(t, session(['2026-09-13T10:00:02Z', '2026-09-13T10:00:01Z', '2026-09-13T10:00:00Z']));

  // Without this, a mistake in the fixtures would make the test vacuous rather than failing.
  assert.notEqual(
    await readFile(join(ascending, 'shuffled.jsonl'), 'utf8'),
    await readFile(join(descending, 'shuffled.jsonl'), 'utf8'),
    'the two sessions must actually differ',
  );

  const before = await source.read(join(ascending, 'shuffled.jsonl'));
  const after = await source.read(join(descending, 'shuffled.jsonl'));

  // Only the times themselves differ (the report page spec M4): they are read for display, and nothing else moves.
  const withoutTimes = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (key, field) => (key === 'at' ? undefined : field)));
  assert.deepEqual(withoutTimes({ ...after, sessionId: '' }), withoutTimes({ ...before, sessionId: '' }));
  assert.deepEqual(before.events.map((event) => event.sequence), [1, 2], 'order comes from the records, not the clock');
  assert.deepEqual(before.events.map((event) => event.evidence.at), [Date.parse('2026-09-13T10:00:00Z'), Date.parse('2026-09-13T10:00:02Z')]);
  assert.deepEqual(after.events.map((event) => event.evidence.at), [Date.parse('2026-09-13T10:00:02Z'), Date.parse('2026-09-13T10:00:00Z')], 'shown as written, never corrected');
});

// M4, `line-timestamp`: a line with no time, or with one that does not parse, has no time - never a guessed one.
test('a line without a readable timestamp has no time, and is never given one', async (t) => {
  const call = (id: string, timestamp?: unknown) => ({
    type: 'assistant', isSidechain: false, ...(timestamp === undefined ? {} : { timestamp }),
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'ls' } }] },
  });
  const root = await writeSession(t, {
    'times.jsonl': jsonl(
      call('toolu_01TIMECCCCCCCCCCCCCCCCCC'),
      call('toolu_01TIMEDDDDDDDDDDDDDDDDDD', 'yesterday'),
      call('toolu_01TIMEEEEEEEEEEEEEEEEEEE', 1726221600000),
      call('toolu_01TIMEFFFFFFFFFFFFFFFFFF', '2026-09-13T10:00:00.000Z'),
    ),
  });
  const model = await source.read(join(root, 'times.jsonl'));
  assert.deepEqual(model.events.map((event) => event.evidence.at), [undefined, undefined, undefined, Date.parse('2026-09-13T10:00:00.000Z')]);
});

test('a denial marker beside two results refuses to name either call', async (t) => {
  const root = await writeSession(t, {
    'two-results.jsonl': jsonl(
      {
        type: 'assistant',
        isSidechain: false,
        uuid: '33333333-3333-4333-8333-333333333333',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu_01PAIRAAAAAAAAAAAAAAAAAA', name: 'Read', input: { file_path: '/secret' } },
            { type: 'tool_use', id: 'toolu_01PAIRBBBBBBBBBBBBBBBBBB', name: 'Bash', input: { command: 'ls' } },
          ],
        },
      },
      {
        type: 'user',
        isSidechain: false,
        toolDenialKind: 'permission-rule',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_01PAIRAAAAAAAAAAAAAAAAAA', content: 'refused' },
            { type: 'tool_result', tool_use_id: 'toolu_01PAIRBBBBBBBBBBBBBBBBBB', content: 'a.txt b.txt' },
          ],
        },
      },
    ),
  });

  const model = await source.read(join(root, 'two-results.jsonl'));

  assert.deepEqual(model.events.map((event) => event.outcome), ['unknown', 'unknown']);
  assert.equal(model.events.filter((event) => event.outcome === 'blocked').length, 0, 'no call is named refused');
  assert.equal(model.completeness, 'unresolved');
});

// Measured 2026-09-24: a Read a deny rule refuses comes back as the tool's own error, with no `toolDenialKind` on the
// record. It was read as a call that ran, and the page said "only saw a name" of a file a rule had kept out.
test('a Read a deny rule refused is blocked, although the record carries no denial marker', async (t) => {
  const refusal = '<tool_use_error>File is in a directory that is denied by your permission settings.</tool_use_error>';
  const root = await writeSession(t, {
    'refused-read.jsonl': jsonl(
      {
        type: 'assistant',
        isSidechain: false,
        uuid: '44444444-4444-4444-8444-444444444444',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu_01READAAAAAAAAAAAAAAAAAA', name: 'Read', input: { file_path: '/work/app/.env' } },
            { type: 'tool_use', id: 'toolu_01READBBBBBBBBBBBBBBBBBB', name: 'Read', input: { file_path: '/work/app/notes.md' } },
          ],
        },
      },
      {
        type: 'user',
        isSidechain: false,
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_01READAAAAAAAAAAAAAAAAAA', content: refusal, is_error: true },
            // The same words in a file's text are the file's text, not a refusal.
            { type: 'tool_result', tool_use_id: 'toolu_01READBBBBBBBBBBBBBBBBBB', content: refusal },
          ],
        },
      },
    ),
  });

  const model = await source.read(join(root, 'refused-read.jsonl'));

  assert.deepEqual(model.events.map((event) => event.outcome), ['blocked', 'succeeded']);
  assert.equal(model.events[0]?.result?.denialKind, 'permission-rule');
});

// An unreadable directory is not an empty one. Reporting the spilled file as missing would name the wrong cause
// and point the reader at the transcript instead of at the permissions.
test('a tool-results directory that cannot be listed is a source gap, not a missing spill', async (t) => {
  const root = await writeSession(t, {
    'locked.jsonl': jsonl({
      type: 'user',
      isSidechain: false,
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_01LOCKAAAAAAAAAAAAAAAAAA', content: 'see tool-results/x.txt' }],
      },
    }),
    'locked/tool-results/x.txt': 'spilled',
  });
  const locked = new FaultyFileSystem(files, [join(root, 'locked', 'tool-results')]);
  const blind = new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(locked), files: locked });

  const model = await blind.read(join(root, 'locked'));

  assert.ok(model.gaps.some((gap) => gap.kind === 'source-missing'), 'the unusable directory is named');
  assert.equal(model.gaps.filter((gap) => gap.kind === 'spilled-result-missing').length, 0);
});

// Without the main transcript there is no session to report on, which is a different thing from a session with
// holes in it - and the difference is what stops a typo'd path from reading as a clean bill of health.
test('a missing main transcript is its own gap, not just a missing source', async () => {
  const model = await read('synthetic/nested-delegation/does-not-exist');

  assert.deepEqual(model.gaps, [{ kind: 'session-missing' }]);
  assert.deepEqual(model.events, []);
});

// A tool named after something on Object.prototype used to come back "known" with a profile of no keys at all,
// and the scan then threw, taking the whole report with it.
test('a tool named like a prototype member is unknown, not a crash', async (t) => {
  const root = await writeSession(t, {
    'proto.jsonl': jsonl({
      type: 'assistant',
      isSidechain: false,
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_01PROTOaaaaaaaaaaaaaaaa', name: 'constructor', input: { path: '/x/.env' } }],
      },
    }),
  });

  const model = await source.read(join(root, 'proto.jsonl'));

  assert.equal(model.events.length, 1);
  assert.equal(model.events[0]?.toolKnown, false);
  assert.deepEqual(model.events[0]?.targets, ['/x/.env'], 'an unknown tool has its whole input searched');
});

// what-came-back R1: a delegated agent's report is text it wrote, and the model now holds what agents wrote.
test("every agent's text blocks are its messages, with where each was written", async () => {
  const model = await read(CORPUS);
  const ofSession = model.messages.filter((message) => message.agentId === model.sessionId);

  assert.equal(ofSession.filter((message) => message.kind === 'said').length, 129);
  assert.equal(ofSession.filter((message) => message.kind === 'reasoning').length, 160, 'what it worked out is its own kind');
  assert.equal(model.messages.filter((message) => message.agentId !== model.sessionId && message.kind === 'said').length, 20);
  for (const message of model.messages) {
    assert.equal(message.evidence.source.kind, message.agentId === model.sessionId ? 'main' : 'agent');
    assert.ok(message.evidence.record > 0);
  }
});

test('a user line that carries text is not a message of any agent', async (t) => {
  const root = await writeSession(t, {
    'words.jsonl': jsonl(
      { type: 'user', isSidechain: false, message: { role: 'user', content: [{ type: 'text', text: 'what broke?' }] } },
      { type: 'assistant', isSidechain: false, message: { role: 'assistant', content: [{ type: 'text', text: 'the webhook' }] } },
    ),
  });

  const model = await source.read(join(root, 'words.jsonl'));

  assert.deepEqual(model.messages.map((message) => message.text), ['the webhook']);
  assert.deepEqual(model.messages[0]?.evidence, { source: { kind: 'main' }, record: 2 });
});

// what-came-back R1b: a delegating result is a list of text blocks, and held encoded its line breaks were escapes.
test('a result that is a list of text blocks is read as its words, and any other structure stays as written', async (t) => {
  const call = (id: string) => ({
    type: 'assistant', isSidechain: false,
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'true' } }] },
  });
  const answer = (id: string, content: unknown) => ({
    type: 'user', isSidechain: false,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] },
  });
  const root = await writeSession(t, {
    'blocks.jsonl': jsonl(
      call('toolu_01TEXTBLOCKSAAAAAAAAAAAA'),
      answer('toolu_01TEXTBLOCKSAAAAAAAAAAAA', [{ type: 'text', text: 'first line' }, { type: 'text', text: 'second line' }]),
      call('toolu_01MIXEDBLOCKSAAAAAAAAAAA'),
      answer('toolu_01MIXEDBLOCKSAAAAAAAAAAA', [{ type: 'text', text: 'words' }, { type: 'image', source: {} }]),
    ),
  });

  const model = await source.read(join(root, 'blocks.jsonl'));

  assert.deepEqual(model.events.map((event) => event.result?.content), [
    'first line\nsecond line',
    JSON.stringify([{ type: 'text', text: 'words' }, { type: 'image', source: {} }]),
  ]);
});

// why-this-call R1 and R4: what an agent works out before it calls is its own kind of words, and a line may carry
// both kinds, in the order they were written.
test('a reasoning block is a message of its own kind, and both kinds keep their order', async (t) => {
  const root = await writeSession(t, {
    'thought.jsonl': jsonl(
      {
        type: 'assistant',
        isSidechain: false,
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'the webhook signs with a secret; find where it is set', signature: 'sig' },
            { type: 'text', text: 'Looking for the secret.' },
          ],
        },
      },
      {
        type: 'assistant',
        isSidechain: false,
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_01THOUGHTAAAAAAAAAAAAAA', name: 'Bash', input: { command: 'grep -rn SECRET apps' } }] },
      },
    ),
  });

  const model = await source.read(join(root, 'thought.jsonl'));

  assert.deepEqual(
    model.messages.map((message) => [message.kind, message.evidence.record]),
    [['reasoning', 1], ['said', 1]],
  );
});

// where-the-value-went R1, R2 and R5: an agent started in the background answers with a launch notice, and its report
// is a notification delivered later on a user line. The queued copy of the same words delivers nothing.
test('a report delivered on a user line joins the delegation it names, and a launch notice is marked', async (t) => {
  const root = await writeSession(t, onwardSessionFiles('background'));

  const model = await source.read(join(root, `${ONWARD_SESSION_ID}.jsonl`));
  const [finder, reviewer] = model.delegations;

  assert.equal(model.delegations.length, 2);
  assert.equal(finder?.reports.length, 1, 'the queued line and the delivery hold the same words; only the delivery counts');
  assert.match(finder?.reports[0]?.content ?? '', /^<task-notification>[\s\S]*<\/task-notification>$/);
  assert.ok(finder?.reports[0]?.content.includes(ONWARD_SECRET), 'the report is held as written, raw, as a result is');
  assert.equal(finder?.reports[0]?.evidence.record, 4);
  assert.equal(reviewer?.reports.length, 1, 'words in text blocks are read as well as a string');
  assert.deepEqual(
    model.events.filter((event) => event.result?.launchNotice === true).map((event) => event.id),
    [finder?.id, reviewer?.id],
  );
  assert.equal(model.delegations.flatMap((delegation) => delegation.reports).length, 2, 'a background command reports nothing to a delegation');
});

test('a launch notice on a record holding two results is attributed to neither', async (t) => {
  const agent = (id: string): object => ({ type: 'tool_use', id, name: 'Agent', input: { prompt: 'p', description: 'd', subagent_type: 'Explore' } });
  const root = await writeSession(t, {
    'two.jsonl': jsonl(
      { type: 'assistant', isSidechain: false, message: { role: 'assistant', content: [agent('toolu_01TWOAAAAAAAAAAAAAAAAAAA'), agent('toolu_01TWOBBBBBBBBBBBBBBBBBBB')] } },
      {
        type: 'user',
        isSidechain: false,
        toolUseResult: { status: 'async_launched', isAsync: true },
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_01TWOAAAAAAAAAAAAAAAAAAA', content: 'launched' },
            { type: 'tool_result', tool_use_id: 'toolu_01TWOBBBBBBBBBBBBBBBBBBB', content: 'launched' },
          ],
        },
      },
    ),
  });

  const model = await source.read(join(root, 'two.jsonl'));

  assert.deepEqual(model.events.map((event) => event.result?.launchNotice), [undefined, undefined]);
});

// where-the-value-went R7: what a call puts into a file is carried, and the text an edit takes out is not.
test('a call that writes a file carries what it puts in, never its path or the text an edit takes out', async (t) => {
  const root = await writeSession(t, onwardSessionFiles('typed-first'));

  const model = await source.read(join(root, `${ONWARD_SESSION_ID}.jsonl`));

  assert.deepEqual(model.events.map((event) => [event.toolName, event.written]), [
    ['Write', [`Replace ${ONWARD_SECRET} with an environment variable.\n`]],
    ['Edit', ['secret: process.env.WEBHOOK_SECRET']],
    ['Read', undefined],
    ['Bash', undefined],
  ]);
});
