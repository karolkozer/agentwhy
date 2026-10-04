// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CodexSessionDiscovery } from '../../../../src/adapter/codex/discovery/codex-session-discovery.ts';
import { readSessionHeader } from '../../../../src/adapter/codex/discovery/session-header.ts';
import { sessionRoots } from '../../../../src/adapter/codex/discovery/session-roots.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { FileAccessError } from '../../../../src/ports/file-access-error.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';
import { FaultyFileSystem } from '../../../helpers/faulty-file-system.ts';
import { CANARY } from '../../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
const discovery = new CodexSessionDiscovery({ directories: files, files });

function metadata(id: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ type: 'session_meta', payload: {
    id, cwd: '/Users/someone/Projects/shop', history_mode: 'paginated', ...extra,
  } });
}

async function layout(t: TestContext, entries: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'agentwhy-codex-discovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(entries)) {
    const path = join(root, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return root;
}

function reader(first: string, after: () => void = () => {}): FileReader {
  return {
    async readText() { throw new Error('whole-file reading is forbidden during discovery'); },
    async *readLines() { try { yield first; throw new Error('read past the first line'); } finally { after(); } },
  };
}

test('recognises a header from one physical line and closes the iterator without reading content', async () => {
  let closed = false;
  const read = await readSessionHeader(reader(metadata('root'), () => { closed = true; }), 'export.txt');
  assert.equal(read.kind, 'recognised');
  assert.equal(closed, true);
  if (read.kind !== 'recognised') return;
  assert.deepEqual(read.header, {
    id: 'root', parent: { kind: 'root' }, project: '/Users/someone/Projects/shop', historyMode: 'paginated', origin: { kind: 'unknown' }, issues: [],
  });
});

test('unknown first lines never fall through to later metadata, including Claude messages', async () => {
  for (const first of ['', '{', 'null', '[]', '{}', '{"type":"assistant"}', metadata(12),
    '{"type":"session_meta","payload":[]}', '{"type":"session_meta","payload":{}}']) {
    let closed = false;
    assert.deepEqual(await readSessionHeader(reader(first, () => { closed = true; }), 'rollout-any.jsonl'), { kind: 'unknown' });
    assert.equal(closed, true);
  }
});

test('missing or malformed optional facts remain explicit and cannot create a root from an invalid parent', async () => {
  const read = await readSessionHeader(reader(metadata('', { cwd: null, parent_thread_id: null, history_mode: CANARY })), 'input');
  assert.equal(read.kind, 'recognised');
  if (read.kind !== 'recognised') return;
  assert.deepEqual(read.header, {
    id: '', parent: { kind: 'unknown' }, historyMode: 'unknown', origin: { kind: 'unknown' },
    issues: ['empty-session-id', 'project-missing', 'parent-invalid', 'history-unrecognised'],
  });
  assert.deepEqual(sessionRoots([read.header]), [{ kind: 'unresolved', reason: 'invalid-identity' }]);
});

// X15, X19: who started a thread is read from the same first line, and a kind the contract does not know stays unknown.
test('a header says who started its thread: a person, another agent, the reviewer, or something unknown', async () => {
  const origin = async (source: unknown) => {
    const read = await readSessionHeader(reader(metadata('id', { source, cli_version: '0.157.0' })), 'input');
    return read.kind === 'recognised' ? [read.header.origin, read.header.version] : undefined;
  };
  assert.deepEqual(await origin('exec'), [{ kind: 'person' }, '0.157.0']);
  assert.deepEqual(await origin({ subagent: { thread_spawn: { parent_thread_id: 'p', depth: 1, agent_path: '/root/helper', agent_role: null } } }),
    [{ kind: 'spawned', spawnedBy: 'p', depth: 1, agentPath: '/root/helper' }, '0.157.0']);
  assert.deepEqual(await origin({ subagent: { thread_spawn: { depth: -1, agent_path: 7 } } }), [{ kind: 'spawned' }, '0.157.0']);
  assert.deepEqual(await origin({ subagent: { other: 'guardian' } }), [{ kind: 'reviewer' }, '0.157.0']);
  for (const source of [{ subagent: { other: CANARY } }, { [CANARY]: {} }, 12, null, undefined]) {
    assert.deepEqual((await origin(source))?.[0], { kind: 'unknown' });
  }
});

test('only filesystem failures become unavailable; programming errors propagate', async () => {
  for (const reason of ['not-found', 'unreadable'] as const) {
    const broken: FileReader = { ...reader(''), async *readLines() { throw new FileAccessError(reason, CANARY); } };
    assert.deepEqual(await readSessionHeader(broken, 'input'), { kind: 'unavailable', reason });
  }
  const bug = new Error('measurement bug');
  const broken: FileReader = { ...reader(''), async *readLines() { throw bug; } };
  await assert.rejects(readSessionHeader(broken, 'input'), (error) => error === bug);
});

test('joins a cross-date tree from first ids, preserving legacy and unknown history as distinct facts', async (t) => {
  const root = await layout(t, {
    '2026/09/01/rollout-a.jsonl': metadata('root'),
    '2026/09/02/rollout-b.jsonl': metadata('child', { parent_thread_id: 'root', history_mode: 'legacy' }),
    '2026/09/03/rollout-c.jsonl': metadata('grandchild', { parent_thread_id: 'child', history_mode: 'future' }),
    '2026/09/04/rollout-d.jsonl': metadata('other') + '\n' + metadata('root'),
  });
  const listing = await discovery.list(root);
  assert.deepEqual(listing.gaps, []);
  assert.deepEqual(listing.sources.map((s) => [s.header.id, s.relation]), [
    ['root', { kind: 'resolved', root: 0 }], ['child', { kind: 'resolved', root: 0 }],
    ['grandchild', { kind: 'resolved', root: 0 }], ['other', { kind: 'resolved', root: 3 }],
  ]);
  assert.equal(listing.sources[1]?.header.historyMode, 'legacy');
  assert.deepEqual(listing.sources[2]?.header.issues, ['history-unrecognised']);
  // Same graph in reverse traversal order, compared by identity rather than position.
  const reversed = [...listing.sources].reverse().map((s) => s.header);
  assert.deepEqual(sessionRoots(reversed).map((r) => r.kind === 'resolved' ? reversed[r.root]?.id : r.reason),
    ['other', 'root', 'root', 'root']);
});

test('duplicate first ids join no file, including children and grandchildren of the ambiguous parent', async (t) => {
  const root = await layout(t, {
    'rollout-a.jsonl': metadata('duplicate'), 'rollout-b.jsonl': metadata('duplicate'),
    'rollout-c.jsonl': metadata('child', { parent_thread_id: 'duplicate' }),
    'rollout-d.jsonl': metadata('grandchild', { parent_thread_id: 'child' }),
  });
  const listing = await discovery.list(root);
  assert.equal(listing.sources.length, 4);
  for (const source of listing.sources) assert.deepEqual(source.relation, { kind: 'unresolved', reason: 'duplicate-id' });
});

test('cycles, self-parenting and missing ancestors stay visible and never become invented roots', async (t) => {
  const root = await layout(t, {
    'rollout-a.jsonl': metadata('a', { parent_thread_id: 'b' }),
    'rollout-b.jsonl': metadata('b', { parent_thread_id: 'a' }),
    'rollout-c.jsonl': metadata('c', { parent_thread_id: 'a' }),
    'rollout-d.jsonl': metadata('d', { parent_thread_id: 'd' }),
    'rollout-e.jsonl': metadata('e', { parent_thread_id: 'missing' }),
    'rollout-f.jsonl': metadata('f', { parent_thread_id: 'e' }),
  });
  const listing = await discovery.list(root);
  assert.deepEqual(listing.sources.map((s) => s.relation), [
    ...Array.from({ length: 4 }, () => ({ kind: 'unresolved', reason: 'cycle' })),
    ...Array.from({ length: 2 }, () => ({ kind: 'unresolved', reason: 'missing-parent' })),
  ]);
});

test('reads only rollout headers when listing; explicit recognition accepts another filename', async (t) => {
  const root = await layout(t, {
    'export.txt': metadata('export'), 'other.jsonl': metadata('other'),
    'rollout-a.jsonl': metadata('root'), 'rollout-b.jsonl': '',
    'rollout-c.jsonl': '{"type":"assistant"}\n' + metadata('later'),
  });
  await symlink(root, join(root, 'loop'));
  await symlink(join(root, 'export.txt'), join(root, 'rollout-link.jsonl'));
  const listing = await discovery.list(root);
  assert.deepEqual(listing.sources.map((s) => s.header.id), ['root']);
  assert.equal(listing.gaps.length, 2);
  assert.ok(listing.gaps.every((gap) => gap.reason === 'unknown-format'));
  assert.equal((await discovery.readHeader(join(root, 'export.txt'))).kind, 'recognised');
});

test('unreadable directories and files preserve healthy sources and missing-parent evidence', async (t) => {
  const root = await layout(t, {
    'hidden/rollout-a.jsonl': metadata('parent'),
    'rollout-b.jsonl': metadata('child', { parent_thread_id: 'parent' }),
    'rollout-c.jsonl': metadata('unreadable'),
  });
  const faulty = new FaultyFileSystem(files, [join(root, 'hidden'), join(root, 'rollout-c.jsonl')]);
  const result = await new CodexSessionDiscovery({ directories: faulty, files: faulty }).list(root);
  assert.equal(result.sources.length, 1);
  assert.deepEqual(result.sources[0]?.relation, { kind: 'unresolved', reason: 'missing-parent' });
  assert.equal(result.gaps.length, 2);
  assert.ok(result.gaps.every((gap) => gap.reason === 'unreadable'));
  assert.deepEqual(await discovery.list(join(root, 'missing')), {
    sources: [], gaps: [{ path: join(root, 'missing'), reason: 'not-found' }],
  });
});
