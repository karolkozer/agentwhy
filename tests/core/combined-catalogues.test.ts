import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { CombinedProjectCatalogue } from '../../src/core/combined-project-catalogue.ts';
import { CombinedSessionCatalogue } from '../../src/core/combined-session-catalogue.ts';
import type { ProjectListing, ProjectSummary } from '../../src/core/project-catalogue.ts';
import type { SessionListing } from '../../src/core/session-catalogue.ts';

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
  const project = (id: string, path: string, conversations: number, modifiedAt: number, exists = true): ProjectSummary =>
    ({ id, path, exists, conversations, newest: { modifiedAt } });
  const claude: ProjectListing = { projects: [project('-shop', '/shop', 2, 10), project('-a-b-c', '/a/b-c', 1, 5)], unreadable: 1 };
  const codex: ProjectListing = { projects: [project('-shop', '/shop', 3, 20, false), project('-a-b-c', '/a/b/c', 4, 30), project('-garden', '/garden', 1, 1)], unreadable: 2 };

  const listing = await new CombinedProjectCatalogue([{ list: async () => claude }, { list: async () => codex }]).list();
  assert.deepEqual(listing.projects.map((each) => [each.id, each.path, each.conversations, each.newest.modifiedAt, each.exists]), [
    ['-shop', '/shop', 5, 20, true],
    ['-a-b-c', '/a/b-c', 1, 5, true],
    ['-garden', '/garden', 1, 1, true],
  ]);
  assert.equal(listing.unreadable, 4, 'the two counted before, and the folder whose id another holds');
});
