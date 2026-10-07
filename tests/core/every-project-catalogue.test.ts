// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { EveryProjectCatalogue } from '../../src/core/every-project-catalogue.ts';
import type { ProjectSummary } from '../../src/core/project-catalogue.ts';
import { sessionKey, type SessionSummary } from '../../src/core/session-catalogue.ts';

// `.ai/plans/2026-10-06-everything-on-this-computer.md` step 2, G11: every project's conversations, each with its project.

const APP = '/Users/someone/Projects/app';
const BLOG = '/Users/someone/Projects/blog';
const NOTES = '/Users/someone/Documents/notes';

function project(path: string, folder: ProjectSummary['folder'] = 'there'): ProjectSummary {
  return { id: path.replaceAll('/', '-'), path, folder, conversations: 1, newest: { modifiedAt: 0 } };
}

function session(id: string, at: number, extra: Partial<SessionSummary> = {}): SessionSummary {
  return { id, path: `/stored/${id}.jsonl`, modifiedAt: at, delegations: 0, provider: 'claude-code', ...extra };
}

test('every project the window lists, each listed by the one-folder catalogue, merged newest first with its project', async () => {
  const asked: string[] = [];
  const byFolder: Record<string, readonly SessionSummary[]> = {
    [APP]: [session('app-new', 50), session('app-old', 10), session('shop', 30, { provider: 'codex' })],
    [BLOG]: [session('blog-1', 40)],
    [NOTES]: [session('notes-1', 20)],
  };
  const every = new EveryProjectCatalogue(
    { list: async () => ({ projects: [project(APP), project(BLOG), project(NOTES, 'not-looked')], unreadable: 2 }) },
    {
      list: async (folder) => {
        asked.push(folder);
        return { directory: folder, found: true, searched: [], sessions: byFolder[folder] ?? [] };
      },
    },
  );

  const listing = await every.list();
  assert.deepEqual(asked.sort(), [APP, BLOG, NOTES].sort());
  assert.deepEqual(listing.sessions.map((one) => [sessionKey(one), one.project?.folder, one.project?.looked]), [
    ['app-new', APP, true],
    ['blog-1', BLOG, true],
    ['codex-shop', APP, true],
    ['notes-1', NOTES, false],
    ['app-old', APP, true],
  ], 'a folder the system guards is listed, and marked not to be looked into (V10b)');
  assert.equal(listing.unreadable, 2, 'projects no conversation said the folder of are counted, never guessed');
});

test('one file two projects list is one row; one key two files carry stays two rows, the older told apart', async () => {
  const shared = session('same-file', 30);
  const every = new EveryProjectCatalogue(
    { list: async () => ({ projects: [project(APP), project(BLOG)], unreadable: 0 }) },
    {
      list: async (folder) => ({
        directory: folder,
        found: true,
        searched: [],
        sessions: folder === APP
          ? [shared, session('twice', 20, { path: '/stored/app/twice.jsonl' })]
          : [shared, session('twice', 10, { path: '/stored/blog/twice.jsonl' })],
      }),
    },
  );

  const listing = await every.list();
  assert.deepEqual(listing.sessions.map((one) => [sessionKey(one), one.path]), [
    ['same-file', '/stored/same-file.jsonl'],
    ['twice', '/stored/app/twice.jsonl'],
    ['twice-2', '/stored/blog/twice.jsonl'],
  ]);
  assert.equal(listing.sessions[2]?.id, 'twice', 'its id is kept: the AI’s own names are looked up by it');
});
