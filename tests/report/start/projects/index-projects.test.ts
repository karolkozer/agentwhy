// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ProjectListing, FolderState, ProjectSummary } from '../../../../src/core/project-catalogue.ts';
import { FileAccessError } from '../../../../src/ports/file-access-error.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';
import { indexProjects } from '../../../../src/report/start/projects/index-projects.ts';
import { notAProject } from '../../../../src/setup/not-a-project.ts';

const HOME = '/Users/someone';
const WATCH = JSON.stringify({
  hooks: {
    SubagentStop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }],
  },
});
const HALF_WATCH = JSON.stringify({ hooks: { SubagentStop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }] } });

const project = (path: string, folder: FolderState = 'there'): ProjectSummary => ({
  id: path.replace(/[^A-Za-z0-9]+/g, '-'),
  path,
  folder,
  conversations: 2,
  newest: { modifiedAt: 1_000 },
});

function filesOf(texts: Readonly<Record<string, string>>): FileReader {
  return {
    readText: async (path) => {
      const text = texts[path];
      if (text === undefined) throw new FileAccessError('not-found', path);
      return text;
    },
    readLines: () => { throw new Error('read whole'); },
  };
}

const run = (listing: ProjectListing, texts: Readonly<Record<string, string>>) =>
  indexProjects(listing, {
    files: filesOf(texts),
    home: HOME,
    workingDirectory: `${HOME}/Projects/shop`,
    noProject: (path) => notAProject(path, HOME) !== undefined,
    switchable: true,
    choosable: false,
    removable: false,
  });

// which-project V10, amended by the maintainer 2026-10-07 ("ten projekt nie ma agentwhy"): set up is agentwhy running -
// `watch` whole from either file. A finished onboarding, its hooks since taken out, runs nothing.
test('a project is set up where watch runs whole from either settings file, and not for a finished onboarding alone', async () => {
  const listing: ProjectListing = {
    projects: [
      project(`${HOME}/Projects/shop`),
      project(`${HOME}/Projects/blog`),
      project(`${HOME}/Projects/notes`),
      project(`${HOME}/Projects/half`),
      project(`${HOME}/Projects/plain`),
    ],
    unreadable: 1,
  };
  const indexed = await run(listing, {
    [`${HOME}/Projects/shop/.claude/settings.local.json`]: WATCH,
    [`${HOME}/Projects/blog/.claude/settings.json`]: WATCH,
    [`${HOME}/Projects/half/.claude/settings.local.json`]: HALF_WATCH,
  });

  assert.deepEqual(indexed.rows.map((row) => [row.name, row.setUp]), [['shop', true], ['blog', true], ['notes', false], ['half', false], ['plain', false]]);
  assert.equal(indexed.unreadable, 1);
});

test('nothing is said where the settings cannot be read, or the folder is gone', async () => {
  const listing: ProjectListing = { projects: [project(`${HOME}/Projects/broken`), project(`${HOME}/Projects/plain`), project(`${HOME}/Projects/gone`, 'gone')], unreadable: 0 };
  const indexed = await run(listing, { [`${HOME}/Projects/broken/.claude/settings.json`]: '{ not json' });
  assert.deepEqual(indexed.rows.map((row) => [row.name, row.setUp]), [['broken', undefined], ['plain', false], ['gone', undefined]]);
});

test('each row says where it is from ~, which is this project, and the home directory and a root are not listed', async () => {
  const listing: ProjectListing = { projects: [project(`${HOME}/Projects/shop`), project(HOME), project('/'), project('/srv/tools')], unreadable: 0 };
  const indexed = await run(listing, {});
  assert.deepEqual(indexed.rows.map((row) => [row.place, row.name, row.current]), [
    ['~/Projects/shop', 'shop', true],
    ['/srv/tools', 'tools', false],
  ]);
  assert.equal(indexed.rows[0]?.id, '-Users-someone-Projects-shop', 'a row is named by its directory, never its path');
});

// Decided by the maintainer 2026-09-28, and amended 2026-10-07: a project whose settings only block files runs nothing of
// agentwhy's, and is not set up; one where refuse runs is.
test('a project is set up where refuse runs, even with no watch, and not where its settings only block files', async () => {
  const listing: ProjectListing = { projects: [project(`${HOME}/Projects/rules`), project(`${HOME}/Projects/refuse`), project(`${HOME}/Projects/bash-only`)], unreadable: 0 };
  const refuse = JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'agentwhy refuse' }] }] } });
  const indexed = await run(listing, {
    [`${HOME}/Projects/rules/.claude/settings.json`]: JSON.stringify({ permissions: { deny: ['Read(./.env*)'] } }),
    [`${HOME}/Projects/refuse/.claude/settings.local.json`]: refuse,
    [`${HOME}/Projects/bash-only/.claude/settings.json`]: JSON.stringify({ permissions: { deny: ['Bash(rm -rf:*)'] } }),
  });
  assert.deepEqual(indexed.rows.map((row) => [row.name, row.setUp]), [['rules', false], ['refuse', true], ['bash-only', false]]);
});

// which-project V10, the maintainer's design: "Hidden: 1 temporary folder" - counted, never listed.
test('a project in the computer\'s temporary space is counted, not listed; none counted, nothing said', async () => {
  const listing: ProjectListing = { projects: [project(`${HOME}/Projects/shop`), project('/private/tmp/try-it'), project('/tmp/other')], unreadable: 0 };
  const indexed = await indexProjects(listing, {
    files: filesOf({}),
    home: HOME,
    workingDirectory: `${HOME}/Projects/shop`,
    noProject: (path) => notAProject(path, HOME) !== undefined,
    temporary: (path) => path.startsWith('/private/tmp/') || path.startsWith('/tmp/'),
    switchable: true,
    choosable: false,
    removable: false,
  });
  assert.deepEqual(indexed.rows.map((row) => row.name), ['shop']);
  assert.equal(indexed.temporary, 2);
  assert.equal((await run({ projects: [project(`${HOME}/Projects/shop`)], unreadable: 0 }, {})).temporary, undefined);
});

// which-project V10b: a folder not looked at is not read for its settings, so the row says nothing of being set up.
test('a folder not looked at is not read for its settings, and says nothing', async () => {
  const read: string[] = [];
  const listing: ProjectListing = { projects: [project(`${HOME}/Documents/blog`, 'not-looked')], unreadable: 0 };
  const indexed = await indexProjects(listing, {
    files: { readText: async (path) => { read.push(path); return WATCH; }, readLines: () => { throw new Error('read whole'); } },
    home: HOME,
    workingDirectory: `${HOME}/Projects/shop`,
    noProject: () => false,
    switchable: true,
    choosable: false,
    removable: false,
  });
  assert.deepEqual(indexed.rows.map((row) => [row.name, row.folder, 'setUp' in row]), [['blog', 'not-looked', false]]);
  assert.deepEqual(read, []);
});

// `remove-a-project-from-the-list` RM6, RM11, RM12, RMD5: what the person removed leaves the rows, wherever the list is
// drawn, and is listed nowhere else.
test('a removed project leaves the rows', async () => {
  const listing: ProjectListing = {
    projects: [project(`${HOME}/Projects/shop`), project(`${HOME}/Projects/blog`), project(`${HOME}/Projects/scratch`)],
    unreadable: 0,
  };
  const known = await indexProjects(listing, {
    files: filesOf({}),
    home: HOME,
    workingDirectory: `${HOME}/Projects/shop`,
    noProject: (path) => notAProject(path, HOME) !== undefined,
    removed: { removedFrom: async (names) => new Set(names.filter((name) => name.endsWith('scratch'))) },
    switchable: true,
    choosable: false,
    removable: true,
  });

  assert.deepEqual(known.rows.map((row) => row.name), ['shop', 'blog']);
  assert.equal(known.removable, true);
});

// RM13, RMD3: a record that cannot be read hides nothing, and the project this page is about is never hidden.
test('nothing is hidden where the record could not be read, nor the project being shown', async () => {
  const listing: ProjectListing = { projects: [project(`${HOME}/Projects/shop`), project(`${HOME}/Projects/blog`)], unreadable: 0 };
  const sources = {
    files: filesOf({}),
    home: HOME,
    workingDirectory: `${HOME}/Projects/shop`,
    noProject: (path: string) => notAProject(path, HOME) !== undefined,
    switchable: true,
    choosable: false,
    removable: true,
  };

  const unread = await indexProjects(listing, { ...sources, removed: { removedFrom: async () => undefined } });
  assert.deepEqual(unread.rows.map((row) => row.name), ['shop', 'blog']);

  const everything = await indexProjects(listing, { ...sources, removed: { removedFrom: async (names) => new Set(names) } });
  assert.deepEqual(everything.rows.map((row) => row.name), ['shop'], 'the project shown stays, whatever the record says');
});
