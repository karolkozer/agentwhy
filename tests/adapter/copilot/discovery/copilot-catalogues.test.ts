// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { CopilotProjectCatalogue } from '../../../../src/adapter/copilot/discovery/copilot-project-catalogue.ts';
import { CopilotSessionCatalogue } from '../../../../src/adapter/copilot/discovery/copilot-session-catalogue.ts';
import { CopilotSessionDiscovery } from '../../../../src/adapter/copilot/discovery/copilot-session-discovery.ts';
import { CopilotSessionIndex } from '../../../../src/adapter/copilot/discovery/copilot-session-index.ts';
import { CopilotSessionTitles } from '../../../../src/adapter/copilot/discovery/copilot-session-titles.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { writeSession } from '../../../helpers/synthetic-session.ts';
import {
  AGENT, FORK, PROJECT, SESSION, TASK_CALL, records, sessionStart, subagentStarted, toolStart, userMessage, workspaceYaml,
} from '../../../helpers/copilot-session.ts';

const files = new NodeFileSystem();
const OTHER = 'b2c3d4e5-0000-4000-8000-000000000000';
const ELSEWHERE = '/Users/someone/Projects/garden';
const SECOND_AGENT = '6a2d3b01-0000-4000-8000-000000000004';

function catalogues(root: string) {
  const index = new CopilotSessionIndex(new CopilotSessionDiscovery({ directories: files, files }));
  return {
    sessions: new CopilotSessionCatalogue({ index, directories: files, files, sessionsRoot: root }),
    projects: new CopilotProjectCatalogue({ index, directories: files, sessionsRoot: root, projectId: (folder) => folder.replaceAll('/', '-'), redactor: new Redactor('test') }),
  };
}

/** A parent that started one agent, a fork of it that started one of its own, and a session of another project. */
async function store(t: Parameters<typeof writeSession>[0]): Promise<string> {
  const copied = [userMessage(), toolStart(TASK_CALL, 'task', { prompt: 'look' }), subagentStarted(AGENT, TASK_CALL)];
  return writeSession(t, {
    [`${SESSION}/events.jsonl`]: records(SESSION, sessionStart(SESSION), ...copied),
    [`${SESSION}/workspace.yaml`]: workspaceYaml({ id: SESSION, cwd: PROJECT, name: 'Fix the cart', forkCount: 1 }),
    [`${FORK}/events.jsonl`]: records(SESSION, sessionStart(FORK), ...copied) + records(FORK, toolStart('toolu_F', 'task', { prompt: 'again' }), subagentStarted(SECOND_AGENT, 'toolu_F')),
    [`${FORK}/workspace.yaml`]: workspaceYaml({ id: FORK, cwd: PROJECT, name: 'Fix the cart again' }),
    [`${OTHER}/events.jsonl`]: records(OTHER, sessionStart(OTHER, { context: { cwd: ELSEWHERE } }), userMessage()),
    [`${OTHER}/workspace.yaml`]: workspaceYaml({ id: OTHER, cwd: ELSEWHERE }),
  });
}

test("a project's Copilot sessions: its own alone, by their file, each counting the agents it started itself (CP11, CP26)", async (t) => {
  const root = await store(t);
  const listing = await catalogues(root).sessions.list(PROJECT);

  assert.equal(listing.found, true);
  assert.deepEqual(listing.searched, [{ provider: 'copilot', directory: root, found: true }]);
  const byId = new Map(listing.sessions.map((session) => [session.id, session]));
  assert.deepEqual([...byId.keys()].sort(), [FORK, SESSION].sort());
  assert.equal(byId.get(SESSION)?.path, join(root, SESSION, 'events.jsonl'));
  assert.equal(byId.get(SESSION)?.provider, 'copilot');
  assert.equal(byId.get(SESSION)?.delegations, 1);
  assert.equal(byId.get(FORK)?.delegations, 1, "the agent copied from its parent is the parent's");
});

test("Copilot's store missing is the store missing, never no conversations", async (t) => {
  const root = await writeSession(t, {});
  const listing = await catalogues(join(root, 'session-state')).sessions.list(PROJECT);
  assert.equal(listing.found, false);
  assert.equal(listing.searched[0]?.store, 'missing');
});

test("the projects Copilot worked in: one per folder, counted, and recognised by the newest conversation's title", async (t) => {
  const root = await store(t);
  const { projects } = await catalogues(root).projects.list();

  const shop = projects.find((project) => project.path === PROJECT);
  assert.equal(shop?.conversations, 2);
  assert.equal(shop?.id, PROJECT.replaceAll('/', '-'));
  assert.ok(shop?.newest.title !== undefined);
  assert.equal(shop?.newest.entryPoint, undefined, 'where it was held is not said in the projects window (WHD5)');
  assert.equal(projects.find((project) => project.path === ELSEWHERE)?.conversations, 1);
});

test('a title is the one the apps show, past the redactor; where it was held is its client; its time is its last line (LA1)', async (t) => {
  const key = ['sk_', 'live_', 'Test0000000000000000000'].join('');
  const root = await writeSession(t, {
    [`${SESSION}/events.jsonl`]: records(SESSION, sessionStart(SESSION), userMessage()),
    [`${SESSION}/workspace.yaml`]: workspaceYaml({ id: SESSION, cwd: PROJECT, name: `Rotate ${key} today`, client: 'github/autopilot' }),
  });
  const titles = new CopilotSessionTitles({ files, tails: files, redactor: new Redactor('test') });

  const seen = await titles.recognise({ id: SESSION, path: join(root, SESSION, 'events.jsonl'), modifiedAt: 0, delegations: 0, provider: 'copilot' });
  assert.ok(seen.title !== undefined && !String(seen.title).includes(key), 'a value in a title never reaches a page');
  assert.match(String(seen.title), /^Rotate .* today$/);
  assert.equal(seen.entryPoint, 'desktop');
  assert.equal(seen.lastActive, Date.parse('2026-10-09T08:00:01.000Z'), "the last record's own time, never the file's");

  const none = await titles.recognise({ id: OTHER, path: join(root, OTHER, 'events.jsonl'), modifiedAt: 0, delegations: 0, provider: 'copilot' });
  assert.deepEqual(none, {}, 'a session with neither file is recognised by nothing, and is no error');
});
