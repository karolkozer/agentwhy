// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { CombinedProjectCatalogue } from '../../src/core/combined-project-catalogue.ts';
import { CombinedSessionCatalogue } from '../../src/core/combined-session-catalogue.ts';
import type { ProjectListing, FolderState, ProjectSummary } from '../../src/core/project-catalogue.ts';
import { noStoreAnywhere, type SessionListing } from '../../src/core/session-catalogue.ts';

// `2026-09-27-what-codex-wrote.md` XD5, X28: one list for both AIs, each row naming its AI, nothing found hidden.
test('one list of conversations from both AIs, newest first, with every place looked in', async () => {
  const claude: SessionListing = {
    directory: '/Users/someone/.claude/projects/-shop', found: false, sessions: [],
    searched: [{ provider: 'claude-code', directory: '/Users/someone/.claude/projects/-shop', found: false }],
  };
  const codex: SessionListing = {
    directory: '/Users/someone/.codex/sessions', found: true,
    searched: [{ provider: 'codex', directory: '/Users/someone/.codex/sessions', found: true }],
    sessions: [
      { id: 'same-id', path: '/a', modifiedAt: 1, delegations: 0, provider: 'codex' },
      { id: 'newer', path: '/b', modifiedAt: 3, delegations: 1, provider: 'codex' },
    ],
  };
  const withSameId: SessionListing = { ...claude, found: true, sessions: [{ id: 'same-id', path: '/c', modifiedAt: 2, delegations: 0, provider: 'claude-code' }] };

  const listing = await new CombinedSessionCatalogue([{ list: async () => withSameId }, { list: async () => codex }]).list('/Users/someone/shop');
  assert.deepEqual(listing.sessions.map((session) => [session.id, session.provider]), [['newer', 'codex'], ['same-id', 'claude-code'], ['same-id', 'codex']],
    'two AIs may give two sessions one id, and both stay');
  const empty = await new CombinedSessionCatalogue([{ list: async () => claude }, { list: async () => codex }]).list('/Users/someone/shop');
  assert.deepEqual(empty.searched.map((place) => [place.provider, place.found]), [['claude-code', false], ['codex', true]]);
  assert.deepEqual([empty.directory, empty.found], [codex.directory, true], 'a project only one AI worked in is still found');
  const nowhere = await new CombinedSessionCatalogue([{ list: async () => claude }, { list: async () => ({ ...codex, found: false, sessions: [] }) }]).list('/x');
  assert.deepEqual([nowhere.directory, nowhere.found], [claude.directory, false]);
});

test('a folder in both AIs is one project; an id another folder holds is counted, never merged or renamed', async () => {
  const project = (id: string, path: string, conversations: number, modifiedAt: number, folder: FolderState = 'there'): ProjectSummary =>
    ({ id, path, folder, conversations, newest: { modifiedAt } });
  const claude: ProjectListing = { projects: [project('-shop', '/shop', 2, 10), project('-a-b-c', '/a/b-c', 1, 5)], unreadable: 1 };
  const codex: ProjectListing = { projects: [project('-shop', '/shop', 3, 20, 'gone'), project('-a-b-c', '/a/b/c', 4, 30), project('-garden', '/garden', 1, 1)], unreadable: 2 };

  const listing = await new CombinedProjectCatalogue([{ list: async () => claude }, { list: async () => codex }]).list();
  assert.deepEqual(listing.projects.map((each) => [each.id, each.path, each.conversations, each.newest.modifiedAt, each.folder]), [
    ['-shop', '/shop', 5, 20, 'there'],
    ['-a-b-c', '/a/b-c', 1, 5, 'there'],
    ['-garden', '/garden', 1, 1, 'there'],
  ]);
  assert.equal(listing.unreadable, 4, 'the two counted before, and the folder whose id another holds');
});

// which-project V10b: a folder one AI's catalogue left alone is not called gone because the other one could not find it.
test('a folder seen by either AI is there, one either left alone is not looked at, and gone only where both found it gone', async () => {
  const one = (folder: FolderState): ProjectSummary => ({ id: '-shop', path: '/shop', folder, conversations: 1, newest: { modifiedAt: 1 } });
  const merged = async (first: FolderState, second: FolderState): Promise<FolderState | undefined> =>
    (await new CombinedProjectCatalogue([{ list: async () => ({ projects: [one(first)], unreadable: 0 }) }, { list: async () => ({ projects: [one(second)], unreadable: 0 }) }]).list()).projects[0]?.folder;

  assert.equal(await merged('there', 'not-looked'), 'there');
  assert.equal(await merged('gone', 'not-looked'), 'not-looked');
  assert.equal(await merged('not-looked', 'gone'), 'not-looked');
  assert.equal(await merged('gone', 'gone'), 'gone');
});

// worth-running-every-day R28, amended 2026-10-01: "nothing saved anywhere" only where every AI's store is missing.
test('no store anywhere is said only where every place searched is missing its store', () => {
  const place = (store: boolean) => ({ provider: 'codex' as const, directory: '/x', found: false, ...(store ? {} : { store: 'missing' as const }) });
  assert.equal(noStoreAnywhere({ searched: [place(false), place(false)] }), true);
  assert.equal(noStoreAnywhere({ searched: [place(false), place(true)] }), false);
  assert.equal(noStoreAnywhere({ searched: [] }), false, 'nothing searched says nothing');
});
