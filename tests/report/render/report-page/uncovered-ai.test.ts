// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { CopilotSessionSource } from '../../../../src/adapter/copilot/events/copilot-session-source.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { buildReport } from '../../../../src/report/build-report.ts';
import { ReportPageRenderer } from '../../../../src/report/render/report-page/report-page-renderer.ts';
import { protectionWords } from '../../../../src/report/render/report-page/files-view.ts';
import type { FileRow } from '../../../../src/report/render/report-page/files.ts';
import type { Redacted } from '../../../../src/core/redaction/redacted.ts';
import { PROJECT, SESSION, records, sessionStart, toolResult, toolStart, userMessage } from '../../../helpers/copilot-session.ts';
import { writeSession } from '../../../helpers/synthetic-session.ts';

// `.ai/specs/2026-10-05-what-copilot-wrote.md` CP20, and the page's answer over a format's traits (F17): a page about a
// Copilot conversation never promises that a block keeps a file from it, and a record whose only gaps are what Copilot
// never says - its thinking, its permission settings - answers as a whole record does.
const files = new NodeFileSystem();
// A file the person's own rule makes private, holding no key: its fix is the wizard's own Protect step (`dataSteps`) - a
// built-in rule's file is always one of keys, which are changed instead (F45).
const CUSTOMERS = `${PROJECT}/data/customers.csv`;
const ROWS = 'name,email\nAda,ada@example.test';
const POLICY = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv' }] };

async function copilotModel(t: TestContext, path: string, content: string): Promise<SessionModel> {
  const root = await writeSession(t, {
    [`${SESSION}/events.jsonl`]: records(SESSION, sessionStart(SESSION), userMessage('Where is the key?'), toolStart('call_A', 'view', { path }), toolResult('call_A', content)),
  });
  return new CopilotSessionSource({ directories: files, files }).read(join(root, SESSION));
}

const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');

function page(model: SessionModel, checkRuns?: boolean, denied?: readonly string[]): string {
  // Inside its project, so the page may offer to protect the file (P38a).
  const report = buildReport(model, POLICY, new Redactor('test', model.projectRoot, false), { share: false, projectRoot: model.projectRoot });
  return english(new ReportPageRenderer().render({ report, withIndexLink: false, ...(checkRuns === undefined ? {} : { checkRuns }), ...(denied === undefined ? {} : { denied }) }));
}

/** The to-do list's answer: Advanced says what the record does not show, whatever the answer is. */
const toDo = (html: string): string => html.slice(html.indexOf('<section id="todo"'), html.indexOf('<section id="files"'));

test('a Copilot conversation that read a private file: the windows name Copilot and promise nothing of it', async (t) => {
  const html = page(await copilotModel(t, CUSTOMERS, ROWS));

  // With the project's settings unread, the window offers Block alone; `start`, which reads them, offers Block or Track.
  assert.match(html, /This protects <code>data\/customers\.csv<\/code> from the AIs agentwhy covers\. You can undo this anytime\./);
  assert.match(html, /Copilot isn’t covered yet: whatever you choose here, Copilot can still open this file, and it won’t tell you when it does\./);
  assert.match(html, /Protect this file from the AIs agentwhy covers\. Copilot isn’t one of them yet: it can still open it\./);
  assert.doesNotMatch(html, /Your AI won’t be able to open it|Your AI will have to ask you before it opens it/);
  assert.doesNotMatch(toDo(html), /class="rp-gap"/, 'what Copilot never says is no gap over the list (F17)');
});

// `copilot-blocks-too` CB10: where agentwhy's check in Copilot was read as running when the page was written, the windows
// say what they say for any AI agentwhy covers; read as not running, or not read, they keep naming Copilot as not covered.
test('a Copilot conversation where agentwhy\'s check runs promises what a block does, and nothing of Copilot not covered', async (t) => {
  const model = await copilotModel(t, CUSTOMERS, ROWS);
  const covered = page(model, true);
  assert.match(covered, /This protects <code>data\/customers\.csv<\/code>\. Your AI won’t be able to open it\./);
  assert.doesNotMatch(covered, /covered yet|agentwhy covers/);
  assert.match(page(model, false), /Copilot isn’t covered yet/, 'a check read as not running');
});

// Found by the review of step 4, decided 2026-10-12: Copilot has no hook of agentwhy's that speaks in the chat, so with its
// check on a Track sentence says a read is seen in the report alone - never the message Claude Code's and Codex's get.
test('with Copilot\'s check on, Track promises no message in the chat, only the report', async (t) => {
  const model = await copilotModel(t, CUSTOMERS, ROWS);
  // The project's settings read, so the window asks Block or Track (BT1).
  const covered = page(model, true, []);
  assert.match(covered, /Copilot can still read it\. agentwhy can’t tell you in the chat when it does — you’ll see it in your report\. Once it has seen what’s inside, you can’t take that back\./);
  assert.doesNotMatch(covered, /you’ll get a message every time it does/);

  const row = { path: 'data/customers.csv' as Redacted, private: true, access: 'name' as const, protection: 'told' as const, toldBy: '**/customers.csv', group: 'none' as const, kind: 'fl.kind.data' };
  assert.equal(english('<p>' + protectionWords(row, undefined, 'Copilot') + '</p>'), '<p>You chose Track: Copilot may open it. agentwhy can’t tell you in the chat when it does — you’ll see it in your report.</p>');
  assert.match(protectionWords(row, undefined, 'Copilot'), /lang="pl">Wybrałeś Obserwuje: Copilot może go otworzyć\. agentwhy nie powie ci o tym na czacie/);
  assert.match(protectionWords(row, undefined, 'Copilot'), /lang="de">Du hast Beobachten gewählt: Copilot darf sie öffnen\. agentwhy kann dir das nicht im Chat sagen/);
  assert.equal(english('<p>' + protectionWords(row) + '</p>'), '<p>You chose Track: your AI may open it, and you’re told when it does.</p>', 'an AI agentwhy speaks for keeps its words');

  const claude = page({ ...model, provider: 'claude-code', capabilities: [], gaps: [], completeness: 'complete' }, undefined, []);
  assert.match(claude, /you’ll get a message every time it does/);
  assert.doesNotMatch(claude, /can’t tell you in the chat/);
});

test('the same conversation in Claude Code keeps its own words, and names no other AI', async (t) => {
  const copilot = await copilotModel(t, CUSTOMERS, ROWS);
  const html = page({ ...copilot, provider: 'claude-code', capabilities: [], gaps: [], completeness: 'complete' });

  assert.match(html, /This protects <code>data\/customers\.csv<\/code>\. Your AI won’t be able to open it\./);
  assert.match(html, /Protect this file\. Your AI will have to ask you before it opens it\./);
  assert.doesNotMatch(html, /covered yet|agentwhy covers|Copilot/);
});

test('a Copilot conversation whose only gaps are what Copilot never says answers "All good."', async (t) => {
  const model = await copilotModel(t, `${PROJECT}/README.md`, '# shop');
  assert.ok(model.gaps.length > 0 && model.gaps.every((gap) => gap.question === 'reasoning' || gap.question === 'permissions'));

  const html = toDo(page(model));
  assert.match(html, /All good\./);
  assert.doesNotMatch(html, /Nothing to fix that we can see|part of the record is missing/i);
});

test('a Copilot conversation with a gap of its own still says part of the record is missing', async (t) => {
  const root = await writeSession(t, {
    [`${SESSION}/events.jsonl`]: records(SESSION, sessionStart(SESSION), userMessage('List it.'), toolStart('call_A', 'view', { path: `${PROJECT}/README.md` })),
  });
  const html = toDo(page(await new CopilotSessionSource({ directories: files, files }).read(join(root, SESSION))));
  assert.match(html, /part of the record is missing/i, 'a call with no outcome is this conversation’s own gap');
});

// A file's own window answers "Protected?" - by this project's rule, the computer's, or the rule of the project the file is
// in (`the-rules-where-the-file-is` RW8): on a Copilot page, never as a promise that the block keeps it from Copilot.
test("a file's window on a Copilot page names Copilot as not covered, whichever rule holds the file", () => {
  const row = (extra: Partial<FileRow>): FileRow => ({
    path: '.env' as Redacted, private: true, access: 'name', protection: 'yes', group: 'none', kind: 'fl.kind.keys', ...extra,
  });
  const say = (words: string): string => english('<p>' + words + '</p>');

  assert.equal(say(protectionWords(row({}), 'Copilot')), '<p>Protected where agentwhy can block. Copilot isn’t covered yet: it can still open it.</p>');
  assert.equal(say(protectionWords(row({ everywhere: true }), 'Copilot')),
    '<p>Protected on this whole computer, where agentwhy can block. Copilot isn’t covered yet: it can still open it.</p>');
  assert.equal(say(protectionWords(row({ elsewhere: 'garden' }), 'Copilot')),
    '<p>Protected in garden, where agentwhy can block. Copilot isn’t covered yet: it can still open it.</p>');
  assert.equal(say(protectionWords(row({ protection: 'told', toldBy: '**/.env' }), 'Copilot')),
    '<p>You chose Track. Copilot isn’t covered yet: it can open it, and it won’t tell you when it does.</p>');
  assert.equal(say(protectionWords(row({ protection: 'no' }), 'Copilot')), '<p>Not protected. Your AI can open it anytime.</p>', 'true of Copilot as it is');
  assert.equal(say(protectionWords(row({ elsewhere: 'garden' }))), '<p>Protected in garden, the project it’s in.</p>', 'another AI keeps its words');
  assert.match(protectionWords(row({ elsewhere: 'garden' }), 'Copilot'), /lang="pl">Chroniony w garden, tam, gdzie agentwhy może blokować. Copilot nie jest jeszcze objęty/);
});
