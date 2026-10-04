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

const run = (listing: ProjectListing, texts: Readonly<Record<string, string>>, finished: readonly string[] | 'failed' = []) =>
  indexProjects(listing, {
    files: filesOf(texts),
    onboarding: { doneFor: async (names) => (finished === 'failed' ? undefined : new Set(names.filter((name) => finished.includes(name)))) },
    home: HOME,
    workingDirectory: `${HOME}/Projects/shop`,
    noProject: (path) => notAProject(path, HOME) !== undefined,
    switchable: true,
    choosable: false,
  });

// which-project V10: set up is W23's two facts - `watch` running from either file, or the onboarding finished.
test('a project is set up where watch runs whole from either settings file, or its onboarding was finished', async () => {
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
  }, ['-Users-someone-Projects-notes']);

  assert.deepEqual(indexed.rows.map((row) => [row.name, row.setUp]), [['shop', true], ['blog', true], ['notes', true], ['half', false], ['plain', false]]);
  assert.equal(indexed.unreadable, 1);
});

test('nothing is said where the settings or the record cannot be read, or the folder is gone', async () => {
  const listing: ProjectListing = { projects: [project(`${HOME}/Projects/broken`), project(`${HOME}/Projects/plain`), project(`${HOME}/Projects/gone`, 'gone')], unreadable: 0 };
  const indexed = await run(listing, { [`${HOME}/Projects/broken/.claude/settings.json`]: '{ not json' }, 'failed');
  assert.deepEqual(indexed.rows.map((row) => [row.name, 'setUp' in row]), [['broken', false], ['plain', false], ['gone', false]]);
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

// Decided by the maintainer 2026-09-28: a project whose settings block files is set up, rules written by hand included.
test('a project is set up where its settings block a file, or refuse runs, even with no watch and no onboarding', async () => {
  const listing: ProjectListing = { projects: [project(`${HOME}/Projects/rules`), project(`${HOME}/Projects/refuse`), project(`${HOME}/Projects/bash-only`)], unreadable: 0 };
  const refuse = JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'agentwhy refuse' }] }] } });
  const indexed = await run(listing, {
    [`${HOME}/Projects/rules/.claude/settings.json`]: JSON.stringify({ permissions: { deny: ['Read(./.env*)'] } }),
    [`${HOME}/Projects/refuse/.claude/settings.local.json`]: refuse,
    [`${HOME}/Projects/bash-only/.claude/settings.json`]: JSON.stringify({ permissions: { deny: ['Bash(rm -rf:*)'] } }),
  });
  assert.deepEqual(indexed.rows.map((row) => [row.name, row.setUp]), [['rules', true], ['refuse', true], ['bash-only', false]], 'a rule that names no file blocks no file');
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
  });
  assert.deepEqual(indexed.rows.map((row) => [row.name, row.folder, 'setUp' in row]), [['blog', 'not-looked', false]]);
  assert.deepEqual(read, []);
});
