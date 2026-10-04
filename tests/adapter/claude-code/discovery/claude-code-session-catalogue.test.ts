// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ClaudeCodeSessionCatalogue } from '../../../../src/adapter/claude-code/discovery/claude-code-session-catalogue.ts';
import { matchesProject, projectDirectoryName } from '../../../../src/adapter/claude-code/contract/projects.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { FileAccessError } from '../../../../src/ports/file-access-error.ts';
import type { DirectoryReader } from '../../../../src/ports/directory-reader.ts';
import { jsonl, writeSession } from '../../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();

// The first real use outside this repository broke the first rule: a project under `…/Web Portal/…` is stored
// as `…-Web-Portal-…`, so the encoder replaces every run of non-alphanumeric characters, not just separators.
test('a working directory is encoded the way the sessions are actually stored', () => {
  assert.equal(
    projectDirectoryName('/Users/someone/Projects/Github/Acme/Web Portal/portal'),
    '-Users-someone-Projects-Github-Acme-Web-Portal-portal',
  );
  assert.equal(
    projectDirectoryName('/Users/someone/Projects/tools/agent-log-viewer/cli'),
    '-Users-someone-Projects-tools-agent-log-viewer-cli',
  );
  assert.equal(matchesProject('-Users-someone-Projects-Web-Portal-portal', '/Users/someone/Projects/Web Portal/portal'), true);
  assert.equal(matchesProject('-Users-someone-Projects-other', '/Users/someone/Projects/Web Portal/portal'), false);
});

async function projectWithSessions(t: Parameters<typeof writeSession>[0], directoryName: string): Promise<string> {
  const home = await writeSession(t, {});
  const project = join(home, '.claude', 'projects', directoryName);
  await mkdir(join(project, 'older', 'subagents'), { recursive: true });
  await writeFile(join(project, 'older.jsonl'), jsonl({ type: 'user', isSidechain: false }));
  await writeFile(join(project, 'older', 'subagents', 'agent-a1.meta.json'), '{"agentType":"Explore"}');
  await new Promise((resolve) => setTimeout(resolve, 10));
  await writeFile(join(project, 'newer.jsonl'), jsonl({ type: 'user', isSidechain: false }));
  return home;
}

test('sessions come back newest first, with how many agents each delegated to', async (t) => {
  const working = '/Users/someone/Projects/app';
  const home = await projectWithSessions(t, projectDirectoryName(working));

  const listing = await new ClaudeCodeSessionCatalogue(files, home).list(working);

  assert.equal(listing.found, true);
  assert.deepEqual(
    listing.sessions.map((session) => [session.id, session.delegations]),
    [
      ['newer', 0],
      ['older', 1],
    ],
  );
});

// The encoding is inferred from examples, so the catalogue does not stake the answer on it: if the name it
// derives is not there, it compares the stored names instead of reporting a project with no sessions.
test('a directory stored under a different encoding is still found', async (t) => {
  const working = '/Users/someone/Projects/Web Portal/app';
  const home = await projectWithSessions(t, '-Users-someone-Projects-Web--Portal-app');

  const listing = await new ClaudeCodeSessionCatalogue(files, home).list(working);

  assert.equal(listing.found, true, 'found by comparison, not by the guessed name');
  assert.equal(listing.sessions.length, 2);
});

test('a project with no sessions says where it looked', async (t) => {
  const home = await writeSession(t, {});

  const listing = await new ClaudeCodeSessionCatalogue(files, home).list('/Users/someone/Projects/never-used');

  assert.equal(listing.found, false);
  assert.deepEqual(listing.sessions, []);
  assert.match(listing.directory, /never-used$/, 'and names the directory, so a wrong guess is visible');
});

// worth-running-every-day R28, amended 2026-10-01: not this project's folder, or no conversations kept here at all.
test('a project not found says whether Claude Code keeps any conversations here at all', async (t) => {
  const empty = await writeSession(t, {});
  const none = await new ClaudeCodeSessionCatalogue(files, empty).list('/Users/someone/Projects/never-used');
  assert.equal(none.searched[0]?.store, 'missing', 'no ~/.claude/projects at all');

  const used = await writeSession(t, {});
  await mkdir(join(used, '.claude', 'projects', projectDirectoryName('/Users/someone/Projects/elsewhere')), { recursive: true });
  const elsewhere = await new ClaudeCodeSessionCatalogue(files, used).list('/Users/someone/Projects/never-used');
  assert.equal(elsewhere.found, false);
  assert.equal(elsewhere.searched[0]?.store, undefined, 'conversations are kept here, only not for this folder');
});

// SearchedPlace.store: a store there but not listable - as a sandbox may leave ~/.claude/projects - is a store missing.
test('a store that is there but cannot be listed is said as missing', async () => {
  const unlistable: DirectoryReader = {
    kindOf: async () => 'directory',
    list: async (path) => { throw new FileAccessError('unreadable', path); },
    modifiedAt: async () => 0,
  };
  const listing = await new ClaudeCodeSessionCatalogue(unlistable, '/Users/someone').list('/Users/someone/Projects/never-used');

  assert.equal(listing.found, false);
  assert.equal(listing.searched[0]?.store, 'missing');
});

test('the store listed to find the project is not listed again to say whether it is there', async () => {
  const listed: string[] = [];
  const counting: DirectoryReader = {
    kindOf: async (path) => { throw new FileAccessError('not-found', path); },
    list: async (path) => { listed.push(path); return path.endsWith('projects') ? [] : Promise.reject(new FileAccessError('not-found', path)); },
    modifiedAt: async () => 0,
  };
  const listing = await new ClaudeCodeSessionCatalogue(counting, '/Users/someone').list('/Users/someone/Projects/never-used');

  assert.equal(listing.searched[0]?.store, undefined, 'the store was listed, so it is there');
  assert.equal(listed.filter((path) => path.endsWith('projects')).length, 1);
});
