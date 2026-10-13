// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { CopilotSessionDiscovery } from '../../../../src/adapter/copilot/discovery/copilot-session-discovery.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';
import { CANARY, writeSession } from '../../../helpers/synthetic-session.ts';
import {
  CHAT_FOLDER, FORK, PROJECT, SESSION, editorStart, records, sessionStart, systemMessage, userMessage, workspaceYaml,
} from '../../../helpers/copilot-session.ts';

const files = new NodeFileSystem();
const discovery = new CopilotSessionDiscovery({ directories: files, files });
const OTHER = 'b2c3d4e5-0000-4000-8000-000000000000';
const asked = (id: string, extra: Record<string, unknown> = {}): string => records(id, sessionStart(id, extra), systemMessage(), userMessage());

test('a session is its folder: its id, file, project, title, app and forks (§2.8, CP3a, CPB35)', async (t) => {
  const root = await writeSession(t, {
    [`${SESSION}/events.jsonl`]: asked(SESSION),
    [`${SESSION}/workspace.yaml`]: workspaceYaml({ id: SESSION, cwd: PROJECT, name: 'Fix the contact form', client: 'github/autopilot', forkCount: 1 }),
  });

  const listing = await discovery.list(root);

  assert.equal(listing.found, true);
  assert.equal(listing.sessions.length, 1);
  const [session] = listing.sessions;
  assert.equal(session?.id, SESSION);
  assert.equal(session?.events, join(root, SESSION, 'events.jsonl'));
  assert.equal(session?.project, PROJECT);
  assert.equal(session?.title, 'Fix the contact form');
  assert.equal(session?.entryPoint, 'desktop');
  assert.equal(session?.forkCount, 1);
  assert.equal(session?.version, '1.0.94');
});

test('a folder that holds no conversation is counted by why, never listed and never named (CP1a, CP29)', async (t) => {
  const NO_MESSAGE = 'c3d4e5f6-0000-4000-8000-000000000000';
  const EDITOR = 'd4e5f6a7-0000-4000-8000-000000000000';
  const root = await writeSession(t, {
    [`${SESSION}/events.jsonl`]: asked(SESSION),
    [`${OTHER}/workspace.yaml`]: workspaceYaml({ id: OTHER, cwd: PROJECT }),
    [`${NO_MESSAGE}/events.jsonl`]: records(NO_MESSAGE, sessionStart(NO_MESSAGE), { type: 'session.shutdown', data: {} }),
    [`${EDITOR}/events.jsonl`]: records(EDITOR, editorStart(EDITOR), userMessage()),
    [`${FORK}/events.jsonl`]: asked(OTHER),
    '.session-operation-locks/x.lock': '',
  });

  const listing = await discovery.list(root);

  assert.deepEqual(listing.sessions.map((session) => session.id), [SESSION]);
  assert.deepEqual(listing.skipped, { 'no-events': 1, 'not-copilot': 1, 'no-message': 1, 'identity-mismatch': 1, unreadable: 0 });
  assert.ok(!JSON.stringify(listing.skipped).includes(CANARY));
});

test('a first line and a workspace.yaml that name different folders leave the session with no project', async (t) => {
  const root = await writeSession(t, {
    [`${SESSION}/events.jsonl`]: asked(SESSION),
    [`${SESSION}/workspace.yaml`]: workspaceYaml({ id: SESSION, cwd: '/Users/someone/Projects/elsewhere' }),
    [`${OTHER}/events.jsonl`]: asked(OTHER, { context: { cwd: CHAT_FOLDER } }),
  });

  const listing = await discovery.list(root);

  const byId = new Map(listing.sessions.map((session) => [session.id, session]));
  assert.equal(byId.get(SESSION)?.project, undefined, 'a conflict is no guess');
  assert.equal(listing.projectConflicts, 1);
  assert.equal(byId.get(OTHER)?.project, CHAT_FOLDER, 'with no workspace.yaml the first line names the folder');
  assert.equal(byId.get(OTHER)?.title, undefined);
});

test('sessions are listed newest first by their file, and the order is for listing alone', async (t) => {
  const root = await writeSession(t, { [`${SESSION}/events.jsonl`]: asked(SESSION), [`${OTHER}/events.jsonl`]: asked(OTHER) });
  await utimes(join(root, SESSION, 'events.jsonl'), new Date('2026-10-09T08:00:00Z'), new Date('2026-10-09T08:00:00Z'));
  await utimes(join(root, OTHER, 'events.jsonl'), new Date('2026-10-09T09:00:00Z'), new Date('2026-10-09T09:00:00Z'));

  assert.deepEqual((await discovery.list(root)).sessions.map((session) => session.id), [OTHER, SESSION]);
});

test('a missing root is not looked at, never "no conversations"', async (t) => {
  const root = await writeSession(t, {});
  const listing = await discovery.list(join(root, 'not-there'));
  assert.equal(listing.found, false);
  assert.deepEqual(listing.sessions, []);
});

test('a session is read up to its first message and no further', async (t) => {
  const root = await writeSession(t, { [`${SESSION}/events.jsonl`]: `${asked(SESSION)}${'x'.repeat(10)}\n` });
  const bounded: FileReader = {
    readText: (path) => files.readText(path),
    async *readLines(path) {
      let read = 0;
      for await (const line of files.readLines(path)) {
        read += 1;
        if (read > 3) throw new Error('read past the first message');
        yield line;
      }
    },
  };
  const listing = await new CopilotSessionDiscovery({ directories: files, files: bounded }).list(root);
  assert.deepEqual(listing.sessions.map((session) => session.id), [SESSION]);
});

test('one folder is read as the listing reads it', async (t) => {
  const root = await writeSession(t, { [`${SESSION}/events.jsonl`]: asked(SESSION), [`${OTHER}/events.jsonl`]: records(OTHER, sessionStart(OTHER)) });
  assert.equal((await discovery.read(join(root, SESSION))).kind, 'session');
  assert.deepEqual(await discovery.read(join(root, OTHER)), { kind: 'skipped', reason: 'no-message' });
});
