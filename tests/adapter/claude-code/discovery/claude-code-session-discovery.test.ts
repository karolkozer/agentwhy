import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ClaudeCodeSessionDiscovery } from '../../../../src/adapter/claude-code/discovery/claude-code-session-discovery.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { FaultyFileSystem } from '../../../helpers/faulty-file-system.ts';

const discovery = new ClaudeCodeSessionDiscovery(new NodeFileSystem());

// Layouts are synthetic and empty: discovery reads names, never content, so no transcript data is involved.
async function layout(t: TestContext, entries: readonly string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'agentwhy-discover-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const entry of entries) {
    const path = join(root, entry);
    if (entry.endsWith('/')) {
      await mkdir(path, { recursive: true });
    } else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, '');
    }
  }
  return root;
}

test('finds all four sources from a session directory', async (t) => {
  const root = await layout(t, [
    'sess-1.jsonl',
    'sess-1/subagents/agent-a1.jsonl',
    'sess-1/subagents/agent-a1.meta.json',
    'sess-1/subagents/agent-b2.jsonl',
    'sess-1/subagents/agent-b2.meta.json',
    'sess-1/tool-results/r1.txt',
  ]);

  const session = await discovery.discover(join(root, 'sess-1'));

  assert.equal(session.sessionId, 'sess-1');
  assert.deepEqual(session.mainTranscript, { present: true, path: join(root, 'sess-1.jsonl') });
  assert.equal(session.subagentsDir.present, true);
  assert.deepEqual(
    session.subagents.map((s) => [s.fileId, s.transcript.present, s.meta.present]),
    [
      ['a1', true, true],
      ['b2', true, true],
    ],
  );
  assert.equal(session.toolResultsDir.present, true);
  assert.deepEqual(session.toolResultFiles, ['r1.txt']);
  assert.deepEqual(session.unrecognised, []);
});

test('accepts the .jsonl path, or a trailing slash, as the same session', async (t) => {
  const root = await layout(t, ['sess-1.jsonl', 'sess-1/subagents/agent-a1.jsonl']);
  const fromDirectory = await discovery.discover(join(root, 'sess-1'));

  assert.deepEqual(await discovery.discover(join(root, 'sess-1.jsonl')), fromDirectory);
  assert.deepEqual(await discovery.discover(`${join(root, 'sess-1')}/`), fromDirectory);
});

test('reports a session without subagents as missing sources, not as zero delegations', async (t) => {
  const root = await layout(t, ['sess-2.jsonl']);

  const session = await discovery.discover(join(root, 'sess-2.jsonl'));

  assert.equal(session.mainTranscript.present, true);
  assert.deepEqual(session.subagentsDir, {
    present: false,
    path: join(root, 'sess-2', 'subagents'),
    reason: 'not-found',
  });
  assert.equal(session.toolResultsDir.present, false);
  assert.deepEqual(session.subagents, []);
});

test('marks a subagent missing half of its file pair explicitly', async (t) => {
  const root = await layout(t, [
    'sess-3.jsonl',
    'sess-3/subagents/agent-a1.jsonl',
    'sess-3/subagents/agent-b2.meta.json',
  ]);

  const session = await discovery.discover(join(root, 'sess-3'));

  assert.deepEqual(
    session.subagents.map((s) => [s.fileId, s.transcript.present, s.meta.present]),
    [
      ['a1', true, false],
      ['b2', false, true],
    ],
  );
});

test('lists entries the contract does not recognise instead of ignoring them', async (t) => {
  const root = await layout(t, [
    'sess-4.jsonl',
    'sess-4/subagents/agent-a1.jsonl',
    'sess-4/subagents/agent-x.json',
    'sess-4/subagents/notes.md',
    'sess-4/subagents/nested/',
    'sess-4/tool-results/r1.txt',
    'sess-4/tool-results/blob.bin',
  ]);

  const session = await discovery.discover(join(root, 'sess-4'));

  assert.deepEqual(session.unrecognised, [
    join('subagents', 'agent-x.json'),
    join('subagents', 'nested'),
    join('subagents', 'notes.md'),
    join('tool-results', 'blob.bin'),
  ]);
  assert.deepEqual(session.toolResultFiles, ['r1.txt']);
});

test('reports a path that does not exist without throwing', async (t) => {
  const root = await layout(t, []);

  const session = await discovery.discover(join(root, 'missing'));

  assert.deepEqual(session.mainTranscript, {
    present: false,
    path: join(root, 'missing.jsonl'),
    reason: 'not-found',
  });
  assert.equal(session.subagentsDir.present, false);
  assert.equal(session.toolResultsDir.present, false);
});

test('reports a source of the wrong kind rather than treating it as present', async (t) => {
  const root = await layout(t, ['sess-5.jsonl/']);

  const session = await discovery.discover(join(root, 'sess-5'));

  assert.deepEqual(session.mainTranscript, {
    present: false,
    path: join(root, 'sess-5.jsonl'),
    reason: 'wrong-kind',
  });
});

test('reports a directory it cannot list as unreadable, and keeps discovering the rest', async (t) => {
  const root = await layout(t, ['sess-6.jsonl', 'sess-6/subagents/agent-a1.jsonl', 'sess-6/tool-results/r1.txt']);
  const subagents = join(root, 'sess-6', 'subagents');
  const locked = new ClaudeCodeSessionDiscovery(new FaultyFileSystem(new NodeFileSystem(), [subagents]));

  const session = await locked.discover(join(root, 'sess-6'));

  assert.deepEqual(session.subagentsDir, { present: false, path: subagents, reason: 'unreadable' });
  assert.deepEqual(session.subagents, []);
  assert.equal(session.mainTranscript.present, true);
  assert.equal(session.toolResultsDir.present, true);
  assert.deepEqual(session.toolResultFiles, ['r1.txt']);
});
