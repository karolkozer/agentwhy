// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { CodexProjectCatalogue } from '../../../../src/adapter/codex/discovery/codex-project-catalogue.ts';
import { CodexSessionCatalogue } from '../../../../src/adapter/codex/discovery/codex-session-catalogue.ts';
import { CodexSessionDiscovery } from '../../../../src/adapter/codex/discovery/codex-session-discovery.ts';
import { CodexSessionIndex } from '../../../../src/adapter/codex/discovery/codex-session-index.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { CHILD, meta, PROJECT, REVIEWER, reviewerMeta, ROOT, rolloutPath, SECOND_CHILD, spawnedMeta } from '../../../helpers/codex-session.ts';
import { CANARY, jsonl, writeSession } from '../../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
const discovery = new CodexSessionDiscovery({ directories: files, files });
const OTHER = '/Users/someone/Projects/garden';
const LOST = '01a0ec9c-0000-7000-8000-0000000000ff';
const STRAY = '01a0ec9c-0000-7000-8000-0000000000fe';

/** A conversation of the shop with a helper and a reviewer, another project's, one with no folder, and a lost thread. */
async function sessions(t: Parameters<typeof writeSession>[0]): Promise<string> {
  const root = await writeSession(t, {
    [rolloutPath(ROOT, '01')]: jsonl(meta(ROOT)),
    [rolloutPath(CHILD, '02')]: jsonl(spawnedMeta(CHILD, ROOT, '/root/a')),
    [rolloutPath(REVIEWER, '02')]: jsonl(reviewerMeta(REVIEWER, ROOT)),
    [rolloutPath(SECOND_CHILD, '03')]: jsonl(meta(SECOND_CHILD, { cwd: OTHER })),
    [rolloutPath(STRAY, '03')]: jsonl(meta(STRAY, { cwd: null })),
    [rolloutPath(LOST, '04')]: jsonl(spawnedMeta(LOST, `${CANARY}-gone`, '/root/b')),
  });
  const at = (day: string, id: string, seconds: number) => utimes(join(root, rolloutPath(id, day)), seconds, seconds);
  await Promise.all([at('01', ROOT, 1_000), at('02', CHILD, 3_000), at('02', REVIEWER, 2_000), at('03', SECOND_CHILD, 5_000), at('03', STRAY, 4_000), at('04', LOST, 6_000)]);
  return root;
}

test("a project's Codex conversations: its roots by exact folder, changed when any thread changed, and a lost thread on its own", async (t) => {
  const root = await sessions(t);
  const listing = await new CodexSessionCatalogue({ index: new CodexSessionIndex(discovery), directories: files, sessionsRoot: root }).list(PROJECT);

  assert.deepEqual(listing.sessions.map((session) => [session.id, session.modifiedAt, session.delegations, session.provider]), [
    [LOST, 6_000_000, 0, 'codex'],
    [ROOT, 3_000_000, 1, 'codex'],
  ], 'the helper is no row; the reviewer is no helper; a thread whose parent is gone is not hidden');
  assert.deepEqual(listing.searched, [{ provider: 'codex', directory: root, found: true }]);
  // Rows are chosen by their first line before any file is looked at: another project's conversations cost nothing here.
  const looked: string[] = [];
  const counting = {
    kindOf: (path: string) => files.kindOf(path),
    list: (path: string) => files.list(path),
    modifiedAt: (path: string) => (looked.push(path), files.modifiedAt(path)),
  };
  await new CodexSessionCatalogue({ index: new CodexSessionIndex(discovery), directories: counting, sessionsRoot: root }).list(PROJECT);
  assert.deepEqual(looked.map((path) => path.slice(root.length + 1)).sort(),
    [rolloutPath(ROOT, '01'), rolloutPath(CHILD, '02'), rolloutPath(REVIEWER, '02'), rolloutPath(LOST, '04')].sort());
  assert.deepEqual((await new CodexSessionCatalogue({ index: new CodexSessionIndex(discovery), directories: files, sessionsRoot: root }).list(`${PROJECT}/`)).sessions, [],
    'the folder is compared as recorded, never by a guess at what else it may be');

  const missing = await new CodexSessionCatalogue({ index: new CodexSessionIndex(discovery), directories: files, sessionsRoot: join(root, 'nowhere') }).list(PROJECT);
  assert.deepEqual([missing.found, missing.sessions], [false, []], 'a sessions root that is not there is "not looked at", not "none"');
  // R28, amended 2026-10-01: the place searched is Codex's whole store, so its absence is the store missing.
  assert.equal(missing.searched[0]?.store, 'missing');
});

test('Codex projects by recorded folder, named by the id they are given, and a conversation with no folder counted', async (t) => {
  const root = await sessions(t);
  const listing = await new CodexProjectCatalogue({
    index: new CodexSessionIndex(discovery), directories: files, sessionsRoot: root, projectId: (folder) => `id:${folder}`,
  }).list();

  // The shop's two rows - its conversation and the lost thread, which records the shop's folder too - newest first.
  assert.deepEqual(listing.projects.map((project) => [project.id, project.path, project.folder, project.conversations, project.newest.modifiedAt]), [
    [`id:${PROJECT}`, PROJECT, 'gone', 2, 6_000_000],
    [`id:${OTHER}`, OTHER, 'gone', 1, 5_000_000],
  ]);
  assert.equal(listing.unreadable, 1);
  assert.ok(!JSON.stringify(listing).includes(CANARY));
});

// `everything-on-this-computer.md` step 2, G11: every project's conversations are listed at once, and Codex keeps them all
// in one root - walked once for all of them, not once a project. A listing asked for later walks it again.
test('every project listed at once walks Codex’s root once; a later listing walks it again', async (t) => {
  const root = await sessions(t);
  let walks = 0;
  const counting = new CodexSessionDiscovery({
    directories: { kindOf: (path) => files.kindOf(path), list: (path) => { if (path === root) walks += 1; return files.list(path); }, modifiedAt: (path) => files.modifiedAt(path) },
    files,
  });
  const index = new CodexSessionIndex(counting);
  const catalogue = new CodexSessionCatalogue({ index, directories: files, sessionsRoot: root });

  const [shop, garden] = await Promise.all([catalogue.list(PROJECT), catalogue.list(OTHER)]);
  assert.equal(walks, 1);
  assert.deepEqual([shop.sessions.map((one) => one.id), garden.sessions.map((one) => one.id)], [[LOST, ROOT], [SECOND_CHILD]], 'each its own project’s');
  assert.equal(index.latest()?.directory, root, 'the listing is kept for the reports, as before');

  await catalogue.list(PROJECT);
  assert.equal(walks, 2, 'nothing is kept past a listing: a thread started since is in the next one');
});
