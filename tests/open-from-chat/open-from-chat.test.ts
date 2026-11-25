// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { OPEN_FROM_CHAT_SINCE, OpenFromChat, type OpenAsk } from '../../src/open-from-chat/open-from-chat.ts';
import { nothingSavedHere } from '../../src/report/nothing-saved-here.ts';
import { isOlder, plainVersion } from '../../src/shared/plain-version.ts';
import type { DetachedAnswer } from '../../src/ports/detached-run.ts';

// RO7, ROD9: a hook pinned to a release before this one is said not to answer, so the number has to be the one it ships in.
test('OPEN_FROM_CHAT_SINCE is a release, and no release that answers the phrase is older than it', () => {
  const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
  assert.ok(plainVersion(OPEN_FROM_CHAT_SINCE) !== undefined);
  assert.ok(version === '0.9.0' || !isOlder(version, OPEN_FROM_CHAT_SINCE), `this release is ${version}: set OPEN_FROM_CHAT_SINCE to it (RELEASING.md)`);
});

const ASK: OpenAsk = { request: 'page', folder: '/Users/someone/shop', plugin: false };
const ADDRESS = 'http://127.0.0.1:43123/tok/index.html';

function opening(answer: DetachedAnswer | undefined | Error) {
  const runs: { readonly args: readonly string[]; readonly folder: string; readonly waitMs: number }[] = [];
  const opens = new OpenFromChat({
    run: {
      run: async (args, folder, waitMs) => {
        runs.push({ args, folder, waitMs });
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
  });
  return { opens, runs };
}

const printed = (output: string, exitCode = 0): DetachedAnswer => ({ ended: true, exitCode, output });

test('RO5: an address is handed to the AI to give, with the limits of what it may do', async () => {
  for (const output of [`Opened: ${ADDRESS}\n`, `Serving: ${ADDRESS}\n`, `That conversation was not found here, so all conversations were opened: ${ADDRESS}\n`]) {
    const { opens } = opening(printed(output));
    const said = await opens.answer(ASK);
    assert.match(said, /^agentwhy, the local tool this user runs, /);
    assert.ok(said.includes(ADDRESS), output);
    assert.match(said, /as a link, in one sentence in their language/);
    assert.match(said, /Do not open, read or summarise any file, and run nothing\./);
  }
});

test('SW10: a conversation asked for and not served is said as that (found by review)', async () => {
  const { opens } = opening(printed(`That conversation was not found here, so all conversations were opened: ${ADDRESS}\n`));
  assert.match(await opens.answer({ ...ASK, request: 'report', sessionKey: 's-1' }), /This conversation was not found there yet, so it opened all conversations: say that too\./);
  assert.doesNotMatch(await opening(printed(`Opened: ${ADDRESS}\n`)).opens.answer(ASK), /not found/);
});

test('PF4: where neither a page nor a file came of it, what stopped it is said (found by review)', async () => {
  const output = 'agentwhy could not keep running in the background here, so the pages were written as files. To open them live, run this command again outside the sandbox, or type npx @agentwhy/cli in a terminal.\nYou started agentwhy in your home folder, which isn\'t a project.\n';
  assert.match(await opening(printed(output)).opens.answer(ASK), /could not serve its page from here/);
});

test('RO4: the command, its folder and the longest wait', async () => {
  const cases: readonly (readonly [Partial<OpenAsk>, readonly string[]])[] = [
    [{}, ['start', '--detach', '--setup-first', '--quiet']],
    [{ sessionKey: 's-1' }, ['start', '--detach', '--setup-first', '--quiet']],
    [{ request: 'report', sessionKey: 's-1' }, ['start', '--detach', '--setup-first', '--quiet', '--session', 's-1']],
    [{ request: 'report', sessionKey: 'codex-s-1' }, ['start', '--detach', '--setup-first', '--quiet', '--session', 'codex-s-1']],
    [{ request: 'report' }, ['start', '--detach', '--setup-first', '--quiet']],
    [{ plugin: true }, ['start', '--detach', '--setup-first', '--quiet', '--plugin']],
  ];
  for (const [asked, args] of cases) {
    const { opens, runs } = opening(printed(`Opened: ${ADDRESS}\n`));
    await opens.answer({ ...ASK, ...asked });
    assert.deepEqual(runs, [{ args, folder: '/Users/someone/shop', waitMs: 15_000 }]);
  }
});

test('RO6: a page still being made ready is said as that, with no address made up', async () => {
  const said = await opening({ ended: false }).opens.answer(ASK);
  assert.match(said, /is getting its page ready and will open it in their browser by itself/);
  assert.doesNotMatch(said, /http/);
  assert.match(said, /run nothing\./);
});

test('RO6, PF4: pages written as files are said with the file and what would serve them', async () => {
  const output = 'agentwhy could not keep running in the background here, so the pages were written as files. To open them live, run this command again outside the sandbox, or type npx @agentwhy/cli in a terminal.\nOpened: /tmp/run/index.html\n';
  const said = await opening(printed(output)).opens.answer(ASK);
  assert.match(said, /\/tmp\/run\/index\.html/);
  assert.match(said, /npx @agentwhy\/cli in a terminal/);
  assert.match(said, /Do not open, read or summarise any file/);
});

test('RO4: a project with no conversation yet is said as that, and not as a page', async () => {
  for (const output of [
    'No sessions are stored for this directory, so there is nothing to list.\n', nothingSavedHere('Claude Code or Codex', '/Users/someone/.claude/projects', 'use one.'),
    'There are no AI chats in shop yet. Work with your AI here, then run agentwhy again.\n', "You're set up. There are no AI chats in shop yet. Work with your AI here, then run agentwhy again.\n",
  ]) {
    const said = await opening(printed(output)).opens.answer(ASK);
    assert.match(said, /has no conversation of this project yet/, output);
    assert.doesNotMatch(said, /http|sandbox/);
  }
});

test('RO6: whatever fails says nothing and lets the message go', async () => {
  for (const answer of [undefined, new Error('no process'), printed('', 1), printed('The policy has errors.\n', 2), printed('', 0)]) {
    assert.equal(await opening(answer).opens.answer(ASK), '');
  }
});
