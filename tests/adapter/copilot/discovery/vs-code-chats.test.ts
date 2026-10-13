// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CopilotTitlesRouter } from '../../../../src/adapter/copilot/chat-log/copilot-source-router.ts';
import { VsCodeChatCatalogue } from '../../../../src/adapter/copilot/discovery/vs-code-chat-catalogue.ts';
import { VsCodeChatTitles } from '../../../../src/adapter/copilot/discovery/vs-code-chat-titles.ts';
import { VsCodeChatDiscovery } from '../../../../src/adapter/copilot/discovery/vs-code-chats.ts';
import { VsCodeProjectCatalogue } from '../../../../src/adapter/copilot/discovery/vs-code-project-catalogue.ts';
import type { SessionSummary } from '../../../../src/core/session-catalogue.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { CANARY, jsonl, writeSession } from '../../../helpers/synthetic-session.ts';
import { chatLog } from '../../../helpers/vs-code-chat.ts';

// `.ai/plans/2026-10-13-what-vs-code-copilot-wrote.md` step 4: Copilot's chats VS Code keeps for a folder, as rows (VC5),
// and those no row can read, counted for Conversations' line (VC6).
const files = new NodeFileSystem();
const STORE = 'Library/Application Support/Code/User/workspaceStorage';
const ONE = '11111111-1111-4111-8111-111111111111';
const TWO = '22222222-2222-4222-8222-222222222222';
const HELPED = '33333333-3333-4333-8333-333333333333';
const LEFT = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';

/** A chat whose title VS Code sets after the snapshot, as it does (VCB-M2). */
function titled(id: string, title: string, requests: Parameters<typeof chatLog>[0]): string {
  return chatLog(requests, { id }) + jsonl({ kind: 1, k: ['customTitle'], v: title });
}

async function world(t: Parameters<typeof writeSession>[0]): Promise<{ readonly project: string; readonly home: string }> {
  const project = await writeSession(t, { 'package.json': '{}' });
  const folder = pathToFileURL(project).href;
  const home = await writeSession(t, {
    [`${STORE}/aaaa/workspace.json`]: JSON.stringify({ folder }),
    [`${STORE}/aaaa/chatSessions/${ONE}.jsonl`]: titled(ONE, 'Find the token', [{ timestamp: 1791885000000 }, { timestamp: 1791885600000 }]),
    [`${STORE}/aaaa/chatSessions/${HELPED}.jsonl`]: titled(HELPED, 'Ask a helper', [{
      calls: [{ id: 'call_HELP', name: 'runSubagent', args: { prompt: CANARY } }, { id: 'call_MORE', name: 'runSubagent', args: { prompt: CANARY } }],
    }]),
    [`${STORE}/aaaa/chatSessions/${LEFT}.jsonl`]: chatLog([], { id: LEFT }),
    [`${STORE}/aaaa/chatSessions/notes.txt`]: 'not a log',
    // A closing slash names the same folder.
    [`${STORE}/bbbb/workspace.json`]: JSON.stringify({ folder: `${folder}/` }),
    [`${STORE}/bbbb/chatSessions/${TWO}.jsonl`]: chatLog([{}], { id: TWO }),
    // Logs no row can read: another first line, a log naming another chat than its file.
    [`${STORE}/bbbb/chatSessions/${OTHER}.jsonl`]: jsonl({ type: 'session.start', data: {} }),
    [`${STORE}/bbbb/chatSessions/66666666-6666-4666-8666-666666666666.jsonl`]: chatLog([{}], { id: OTHER }),
    // Other folders' workspaces, and one that names none.
    [`${STORE}/cccc/workspace.json`]: JSON.stringify({ folder: `${folder}/sub` }),
    [`${STORE}/cccc/chatSessions/${OTHER}.jsonl`]: chatLog([{}], { id: OTHER }),
    [`${STORE}/dddd/workspace.json`]: '{ not json',
    [`${STORE}/eeee/workspace.json`]: JSON.stringify({ workspace: `${folder}/shop.code-workspace` }),
    [`${STORE}/ffff/workspace.json`]: JSON.stringify({ folder: 'vscode-remote://ssh-remote+box/srv/shop' }),
  });
  return { project, home };
}

test("a folder's chats are its workspaces' logs with a request; a log no row can read is counted, a chat left empty is not (VC5, VC6)", async (t) => {
  const { project, home } = await world(t);
  const listing = await new VsCodeChatDiscovery({ directories: files, files, home, platform: 'darwin' }).list(project);
  assert.equal(listing.found, true);
  assert.deepEqual(listing.chats.map((chat) => chat.id).sort(), [ONE, TWO, HELPED].sort());
  assert.equal(listing.unread, 2, 'another first line, and a log naming another chat');

  const one = listing.chats.find((chat) => chat.id === ONE);
  assert.deepEqual([one?.title, one?.lastActive, one?.helpers], ['Find the token', 1791885600000, 0], 'the title set after the snapshot; the last request');
  assert.equal(listing.chats.find((chat) => chat.id === HELPED)?.helpers, 2);
  assert.ok(one?.log.endsWith(join('aaaa', 'chatSessions', `${ONE}.jsonl`)));
});

test('a platform not measured, or no VS Code, lists nothing and says it was not there', async (t) => {
  const { project, home } = await world(t);
  assert.deepEqual(await new VsCodeChatDiscovery({ directories: files, files, home, platform: 'linux' }).list(project), {
    root: join(home, STORE), found: false, chats: [], unread: 0,
  });
  const nowhere = await writeSession(t, {});
  assert.equal((await new VsCodeChatDiscovery({ directories: files, files, home: nowhere, platform: 'darwin' }).list(project)).found, false);
});

test("the catalogue lists each chat as Copilot's by its log, and names VS Code's store only where it is there", async (t) => {
  const { project, home } = await world(t);
  const listing = await new VsCodeChatCatalogue(new VsCodeChatDiscovery({ directories: files, files, home, platform: 'darwin' })).list(project);
  assert.ok(listing.sessions.every((session) => session.provider === 'copilot' && session.path.endsWith(`${session.id}.jsonl`)));
  assert.equal(listing.sessions.find((session) => session.id === HELPED)?.delegations, 2);
  assert.deepEqual(listing.searched, [{ provider: 'copilot', directory: join(home, STORE), found: true }]);

  const none = await new VsCodeChatCatalogue(new VsCodeChatDiscovery({ directories: files, files, home: await writeSession(t, {}), platform: 'darwin' })).list(project);
  assert.deepEqual([none.sessions, none.searched], [[], []], 'a person with no VS Code is told nothing of it');
});

test("a chat's row says its title past the redactor, that it was held in a code editor, and its last request's time (VCD2)", async (t) => {
  const { project, home } = await world(t);
  const discovery = new VsCodeChatDiscovery({ directories: files, files, home, platform: 'darwin' });
  const [session] = (await new VsCodeChatCatalogue(discovery).list(project)).sessions.filter((each) => each.id === ONE);
  assert.ok(session !== undefined);
  const scanned: string[] = [];
  const titles = new VsCodeChatTitles({ discovery, redactor: { scan: (text: string) => { scanned.push(text); return text as never; } } });
  const recognised = await titles.recognise(session);
  assert.deepEqual([recognised.title, recognised.entryPoint, recognised.lastActive], ['Find the token', 'editor', 1791885600000]);
  assert.ok(scanned.includes('Find the token'), 'the title passed the redactor');

  const runtime = { recognise: async () => ({ entryPoint: 'terminal' as const }) };
  const router = new CopilotTitlesRouter({ runtime, vsCode: titles, isVsCodeChat: async (path) => (path === session.path ? 'recognised' : 'unknown') });
  assert.equal((await router.recognise(session)).entryPoint, 'editor');
  assert.equal((await router.recognise({ ...session, path: '/elsewhere/events.jsonl' } as SessionSummary)).entryPoint, 'terminal');
});

test("every folder VS Code keeps chats for is a project, named as Claude Code would name it, by its newest chat's title (V9, VC5)", async (t) => {
  const { project, home } = await world(t);
  const discovery = new VsCodeChatDiscovery({ directories: files, files, home, platform: 'darwin' });
  const every = await discovery.everyFolder();
  assert.deepEqual([...every.folders.keys()].sort(), [project, join(project, 'sub')], "a folder's two workspaces are one; its sub-folder's workspace another");
  assert.deepEqual([every.folders.get(project)?.length, every.folders.get(join(project, 'sub'))?.length], [3, 1]);
  assert.equal(every.unlisted, 0, 'the multi-root workspace holds no chat');

  const scanned: string[] = [];
  const catalogue = new VsCodeProjectCatalogue({
    discovery, directories: files, projectId: (folder) => `id:${folder}`, redactor: { scan: (text: string) => { scanned.push(text); return text as never; } },
  });
  const listing = await catalogue.list();
  const mine = listing.projects.find((each) => each.path === project);
  assert.deepEqual([mine?.id, mine?.folder, mine?.conversations], [`id:${project}`, 'there', 3]);
  assert.equal(listing.projects.find((each) => each.path === join(project, 'sub'))?.folder, 'gone', 'a folder no longer there is listed, and cannot be chosen');
  assert.ok(scanned.length > 0, 'the title passed the redactor');
  const left = await new VsCodeProjectCatalogue({ discovery, directories: files, projectId: String, redactor: { scan: (text: string) => text as never }, leaveAlone: () => true }).list();
  assert.ok(left.projects.every((each) => each.folder === 'not-looked'), 'a folder the system guards is not looked into (V10b)');
});

test('a workspace with chats that names no folder on this computer is counted, never guessed (VCB4)', async (t) => {
  const project = await writeSession(t, { 'package.json': '{}' });
  const home = await writeSession(t, {
    [`${STORE}/multi/workspace.json`]: JSON.stringify({ workspace: `${pathToFileURL(project).href}/shop.code-workspace` }),
    [`${STORE}/multi/chatSessions/${ONE}.jsonl`]: chatLog([{}], { id: ONE }),
    [`${STORE}/remote/workspace.json`]: JSON.stringify({ folder: 'vscode-remote://ssh-remote+box/srv/shop' }),
    [`${STORE}/remote/chatSessions/${TWO}.jsonl`]: chatLog([{}], { id: TWO }),
  });
  const listing = await new VsCodeProjectCatalogue({
    discovery: new VsCodeChatDiscovery({ directories: files, files, home, platform: 'darwin' }), directories: files, projectId: String, redactor: { scan: (text: string) => text as never },
  }).list();
  assert.deepEqual([listing.projects, listing.unreadable], [[], 2]);
});
