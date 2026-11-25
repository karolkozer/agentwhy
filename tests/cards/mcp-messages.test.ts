// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { CardMessages, type CardAnswers } from '../../src/cards/mcp-messages.ts';
import type { ConversationAnswer, ListAnswer } from '../../src/report/answers/answer-model.ts';

// `specs/2026-11-24-talking-about-agentwhy.md` CV1-CV3, CV6, CV11, CVD12: the plugin's own server for its card.

const CONVERSATION = {
  about: 'conversation', look: 'read', numbers: { read: 1, name: 0, stopped: 0, opened: 0, unknown: 0, changed: 0, helpers: 0 },
  steps: { n: 1, leftOut: 0, list: [{ tone: 'coral', label: 'x' }], moments: [], momentsMore: 0, reads: 1, ordinary: 0, helperSteps: 0 },
  files: [], filesMore: 0, helpers: [], helpersMore: 0, todo: [], todoMore: 0, todoKeys: 0, all: 3,
} as ConversationAnswer;
const KEY = '4f2a91c0-0000-4000-8000-000000000001';
const LIST = {
  about: 'list', scope: 'project', asked: '7d', checked: { read: 1, of: 1 }, groups: { attention: 1, fixed: 0, tracked: 0, stopped: 0, seen: 0, none: 0, partly: 0, failed: 0 },
  rows: [{ key: KEY, ref: '4f2a91c0', report: true, title: 'Fix payments', provider: 'claude-code', day: { year: 2026, month: 11, day: 24 }, time: '09:12', held: 'terminal', look: 'read', group: 'attention', read: 1, files: { read: 1, changed: 0, unknown: 0, opened: 0, stopped: 0, name: 0 }, all: 7, helpers: 0 }],
  recent: 1, rowsMore: 0, often: [], oftenMore: 0, namedOnly: 0,
} as unknown as ListAnswer;

function server(more: Partial<CardAnswers> = {}) {
  const asked: string[] = [];
  const answers: CardAnswers = {
    lang: async () => 'en',
    here: 'project',
    self: async () => undefined,
    conversation: async (key) => { asked.push(`conversation ${key ?? 'this'}`); return CONVERSATION; },
    list: async (scope) => { asked.push(`list ${scope}`); return { ...LIST, scope }; },
    peek: async () => undefined,
    address: async () => 'http://127.0.0.1:43123/token/',
    open: async (scope, key) => { asked.push(`open ${scope} ${key ?? ''}`); return { url: 'http://127.0.0.1:43123/token/index.html', found: true }; },
    card: (lang) => `<html lang="${lang}"></html>`,
    now: () => 1_795_555_000_000,
    ...more,
  };
  return { messages: new CardMessages(answers, '1.2.3'), asked };
}
const ask = async (messages: CardMessages, method: string, params: object = {}) =>
  (await messages.answer(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }))) as { result?: any; error?: { code: number } };
const call = async (messages: CardMessages, args: object) => (await ask(messages, 'tools/call', { name: 'what_happened', arguments: args })).result;

test('it says who it is, lists one read-only tool and one card, and answers what it does not know as that', async () => {
  const { messages } = server();
  assert.equal((await ask(messages, 'initialize', { protocolVersion: '2025-06-18' })).result.protocolVersion, '2025-06-18');
  const { tools } = (await ask(messages, 'tools/list')).result;
  assert.deepEqual(tools.map((tool: { name: string }) => tool.name), ['what_happened']);
  assert.deepEqual(tools[0].annotations, { readOnlyHint: true, destructiveHint: false, openWorldHint: false });
  assert.equal(tools[0]._meta.ui.resourceUri, 'ui://agentwhy/card-1.2.3.html');
  const read = (await ask(messages, 'resources/read', { uri: 'ui://agentwhy/card-1.2.3.html' })).result.contents[0];
  assert.deepEqual([read.mimeType, read.text], ['text/html;profile=mcp-app', '<html lang="en"></html>']);
  assert.equal((await ask(messages, 'server/discover')).error?.code, -32601);
  assert.equal(await messages.answer('not json'), undefined);
  assert.equal(await messages.answer('{"jsonrpc":"2.0","method":"notifications/initialized"}'), undefined);
});

test('the model is given the words, and the data goes to the card alone', async () => {
  const { messages, asked } = server();
  const result = await call(messages, { about: 'summary' });
  assert.match(result.content[0].text, /Your AI read 1 private file/);
  assert.equal(result.structuredContent, undefined);
  assert.deepEqual(result._meta['agentwhy/answer'].conversation, CONVERSATION);
  assert.equal(result._meta['agentwhy/answer'].about, 'summary');
  assert.deepEqual(asked, ['conversation this']);
});

test('a list is asked of its scope, the project unless the person asked about the computer', async () => {
  const { messages, asked } = server();
  await call(messages, { about: 'okay' });
  await call(messages, { about: 'often', where: 'computer' });
  assert.deepEqual(asked.filter((one) => one.startsWith('list')), ['list project', 'list computer']);
});

test('an argument off the lists reads nothing', async () => {
  const { messages, asked } = server();
  for (const args of [{ about: 'everything' }, {}, { about: 'okay', where: 'moon' }, { about: 'summary', conversation: '../../etc' }, { about: 'summary', conversation: 'a; rm' }]) {
    assert.equal((await call(messages, args)).isError, true, JSON.stringify(args));
  }
  assert.deepEqual(asked, []);
});

test('another conversation is asked by the short name a list gave it, and by no name it did not', async () => {
  const { messages, asked } = server();
  assert.equal((await call(messages, { about: 'summary', conversation: '4f2a91c0' })).isError, true, 'not listed yet');
  await call(messages, { about: 'conversations' });
  const result = await call(messages, { about: 'steps', conversation: '#4f2a91c0' });
  assert.equal(result.isError, undefined);
  assert.equal(asked.at(-1), `conversation ${KEY}`);
  assert.equal(result._meta['agentwhy/answer'].title, 'Fix payments');
  assert.match(result.content[0].text, /^\*\*agentwhy\*\* · Fix payments$/m, 'the words name it too, never as this conversation');
});

test('the report is the one thing that starts a page, and answers its address', async () => {
  const { messages, asked } = server();
  await call(messages, { about: 'okay' });
  assert.ok(!asked.some((one) => one.startsWith('open')));
  const result = await call(messages, { about: 'report' });
  assert.match(result.content[0].text, /http:\/\/127\.0\.0\.1:43123\/token\/index\.html/);
  assert.deepEqual(asked.at(-1), 'open project ');
  assert.equal((await call(server({ open: async () => undefined }).messages, { about: 'report' })).isError, undefined);
});

test('a server still coming up, and none, are said in words', async () => {
  assert.match((await call(server({ list: async () => 'starting' }).messages, { about: 'okay' })).content[0].text, /still reading/);
  assert.match((await call(server({ list: async () => 'no-server' }).messages, { about: 'okay' })).content[0].text, /couldn’t start its page/);
});

test('a conversation that could not be answered is said in agentwhy\'s own sentence, and whatever fails is one line', async () => {
  assert.match((await call(server({ conversation: async () => 'Not written down yet.' }).messages, { about: 'summary' })).content[0].text, /Not written down yet/);
  const failed = await call(server({ conversation: async () => { throw new Error('CANARY /Users/someone/secret'); } }).messages, { about: 'summary' });
  assert.ok(!JSON.stringify(failed).includes('CANARY'));
});

test('what the model is told of the card never asks it to retell it, and never lets it call anything safe', async () => {
  const description = (await ask(server().messages, 'tools/list')).result.tools[0].description as string;
  assert.match(description, /one or two short sentences/i);
  assert.match(description, /never/i);
  assert.ok(description.length < 1800);
});

// CV13, CVB23 (measured in Claude Code 2.1.308): the terminal's card is handed a text block's own `_meta` and nothing of the result's,
// and the model is handed neither.
test('the terminal gets the one answer asked for, on the words themselves', async () => {
  const { messages } = server({ peek: async () => LIST });
  const block = (await call(messages, { about: 'summary' })).content[0];
  assert.deepEqual(block._meta['agentwhy/answer'], { about: 'summary', lang: 'en', conversation: CONVERSATION });
  const list = (await call(messages, { about: 'okay' })).content[0];
  assert.deepEqual(list._meta['agentwhy/answer'], { about: 'okay', lang: 'en', list: { ...LIST, rows: [], often: [] } });
  const other = (await call(messages, { about: 'steps', conversation: '4f2a91c0' })).content[0];
  assert.deepEqual(other._meta['agentwhy/answer'], { about: 'steps', lang: 'en', conversation: CONVERSATION, other: { title: 'Fix payments' } });
  assert.equal((await call(messages, { about: 'report' })).content[0]._meta, undefined);
});

test('the terminal is handed what its card draws of a moment, and the app all of it', async () => {
  const moment = { from: 1, to: 1, tone: 'coral' as const, said: 'Read .env', files: ['.env'], label: 'look.read', ran: ['Bash'], wrote: { text: 'x'.repeat(200) }, met: [{ path: '.env', access: 'read' as const }], helper: 2 };
  const told = { ...CONVERSATION, steps: { ...CONVERSATION.steps, moments: [moment] } };
  const result = await call(server({ conversation: async () => told }).messages, { about: 'steps' });
  assert.deepEqual(result.content[0]._meta['agentwhy/answer'].conversation.steps.moments, [{ from: 1, to: 1, tone: 'coral', said: 'Read .env', files: ['.env'], met: moment.met, helper: 2 }]);
  assert.deepEqual(result._meta['agentwhy/answer'].conversation.steps.moments, [moment]);
});

test('an answer too long for the terminal is left to its words, which are whole', async () => {
  const long = { ...CONVERSATION, files: Array.from({ length: 3000 }, (_, n) => ({ path: `some/folder/file-${n}.env`, access: 'read' as const })) };
  const result = await call(server({ conversation: async () => long }).messages, { about: 'files' });
  assert.equal(result.content[0]._meta, undefined);
  assert.equal(result._meta['agentwhy/answer'].conversation.files.length, 3000);
});

// The review of 2026-11-24.
test('CV15: a conversation in the home folder is about this computer unless it says otherwise', async () => {
  const { messages, asked } = server({ here: 'computer' });
  await call(messages, { about: 'okay' });
  await call(messages, { about: 'report' });
  await call(messages, { about: 'often', where: 'project' });
  assert.deepEqual(asked, ['list computer', 'open computer ', 'list computer'], 'the home folder is no project');
});

test('a link to the page is only where the page answers, and to the page that conversation is on', async () => {
  const none = server({ peek: async () => undefined });
  assert.equal((await call(none.messages, { about: 'summary' }))._meta['agentwhy/answer'].pages, undefined);
  const asked: string[] = [];
  const there = server({ peek: async (scope) => { asked.push(scope); return { ...LIST, scope }; }, address: async (scope) => `http://127.0.0.1:43123/${scope}/` });
  await call(there.messages, { about: 'conversations', where: 'computer' });
  const other = await call(there.messages, { about: 'summary', conversation: '4f2a91c0' });
  assert.equal(other._meta['agentwhy/answer'].pages, 'http://127.0.0.1:43123/computer/');
  assert.equal(asked.at(-1), 'computer');
});

test('the report of a conversation of the computer\'s list is opened there, and one not on the page is said', async () => {
  const { messages, asked } = server({ open: async (scope, key) => { asked.push(`open ${scope} ${key ?? ''}`); return { url: 'http://127.0.0.1:43123/token/index.html', found: false }; } });
  await call(messages, { about: 'conversations', where: 'computer' });
  const result = await call(messages, { about: 'report', conversation: '4f2a91c0' });
  assert.equal(asked.at(-1), `open computer ${KEY}`);
  assert.match(result.content[0].text, /isn’t on the page/);
  assert.match(result.content[0].text, /http:\/\/127\.0\.0\.1:43123\/token\/index\.html/);
});

test('a short name that fits two conversations is neither of them, and a longer one tells them apart', async () => {
  const two = { ...LIST, rows: ['019ab3c4-1111-7000-8000-000000000001', '019ab3c4-2222-7000-8000-000000000002'].map((id, n) => ({ ...LIST.rows[0]!, key: `codex-${id}`, ref: id.slice(0, 13), title: `T${n}` })) };
  const { messages, asked } = server({ list: async () => two });
  await call(messages, { about: 'conversations' });
  assert.match((await call(messages, { about: 'summary', conversation: '019ab3c4' })).content[0].text, /more than one/i);
  await call(messages, { about: 'summary', conversation: '019ab3c4-2222' });
  assert.equal(asked.at(-1), 'conversation codex-019ab3c4-2222-7000-8000-000000000002');
});

test('after a resume the names of an earlier list are found again', async () => {
  const { messages, asked } = server({ peek: async (scope) => ({ ...LIST, scope }) });
  await call(messages, { about: 'summary', conversation: '#4f2a91c0' });
  assert.equal(asked.at(-1), `conversation ${KEY}`);
});

test('what was answered in one sentence is on the card too, and the report is a link there', async () => {
  const starting = await call(server({ list: async () => 'starting' }).messages, { about: 'okay' });
  assert.match(starting._meta['agentwhy/answer'].said, /still reading/);
  const report = await call(server().messages, { about: 'report' });
  assert.equal(report._meta['agentwhy/answer'].link, 'http://127.0.0.1:43123/token/index.html');
  assert.equal((await call(server({ list: async () => 'newer' }).messages, { about: 'okay' })).content[0].text.includes('newer agentwhy'), true);
});

test('every message that has an id is answered', async () => {
  assert.equal((await server().messages.answer('{"jsonrpc":"2.0","id":3,"method":"tools/list","params":null}') as { id: number }).id, 3);
});

// CVB22: after `/clear` the server goes on, in a conversation of another id.
test('this conversation is the one the call is in', async () => {
  const told: (string | undefined)[] = [];
  const without: (string | undefined)[] = [];
  const asked: string[] = [];
  const { messages } = server({ self: async (callId) => { told.push(callId); return callId === 'toolu_01AbCdEfGh' ? 'new-one' : 'started-in'; },
    conversation: async (key, callId) => { asked.push(`conversation ${key ?? 'this'}`); without.push(callId); return CONVERSATION; } });
  const result = (await ask(messages, 'tools/call', { name: 'what_happened', arguments: { about: 'summary' }, _meta: { 'claudecode/toolUseId': 'toolu_01AbCdEfGh' } })).result;
  assert.equal(asked.at(-1), 'conversation new-one');
  assert.equal(result._meta['agentwhy/answer'].self, 'new-one');
  await call(messages, { about: 'summary' });
  assert.equal(asked.at(-1), 'conversation started-in');
  await call(messages, { about: 'conversations' });
  await call(messages, { about: 'summary', conversation: '4f2a91c0' });
  assert.equal(asked.at(-1), `conversation ${KEY}`, 'another one is asked by its own name');
  assert.deepEqual(told, ['toolu_01AbCdEfGh', undefined]);
  assert.deepEqual(without, ['toolu_01AbCdEfGh', undefined, undefined], 'the call that asks is no gap in what it asks about');
});

test('the reading is told to an app that asked how far a call is, only where it got further, and to no other', async () => {
  const list: CardAnswers['list'] = async (scope, asked) => {
    for (const read of [1, 1, 12]) asked?.progress?.({ read, of: 35 });
    return { ...LIST, scope };
  };
  const run = async (meta: object) => {
    const told: any[] = [];
    await server({ list }).messages.answer(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'what_happened', arguments: { about: 'okay' }, _meta: meta } }), (message) => told.push(message));
    return told;
  };
  const told = await run({ progressToken: 7 });
  assert.deepEqual(told.map((one) => [one.method, one.params.progressToken, one.params.progress, one.params.total]), [['notifications/progress', 7, 1, 35], ['notifications/progress', 7, 12, 35]]);
  assert.match(told[0].params.message, /1 of 35/);
  assert.equal('id' in told[0], false);
  assert.deepEqual(await run({}), []);
  assert.deepEqual(await run({ progressToken: { no: 1 } }), []);
});

test('a list is asked with the call that asks', async () => {
  const calls: unknown[] = [];
  const { messages } = server({ list: async (scope, asked) => { calls.push(asked?.call); return { ...LIST, scope }; } });
  await ask(messages, 'tools/call', { name: 'what_happened', arguments: { about: 'okay' }, _meta: { 'claudecode/toolUseId': 'toolu_01abcDEF' } });
  await call(messages, { about: 'okay' });
  assert.deepEqual(calls, ['toolu_01abcDEF', undefined]);
});

// The maintainer's run of 2026-11-24: "jakie mialem sesje" was answered by a command in the shell.
test('the AI is told that the sessions a person had are asked of it, and not of a command', async () => {
  const { tools } = (await ask(server().messages, 'tools/list')).result;
  assert.match(tools[0].description, /conversations, chats or sessions with an AI they had/);
  assert.match(tools[0].description, /instead of agentwhy's commands in a shell/);
});

// Measured 2026-11-24 on 2.1.308 and 2.1.330 (CVB28): put off behind tool search, the AI was shown the tool's name and none of its description,
// and answered "which sessions did I have" from a command.
test('the tool is shown to the AI whole from the start, in an app that would put it off', async () => {
  const [tool] = (await ask(server().messages, 'tools/list')).result.tools;
  assert.equal(tool._meta['anthropic/alwaysLoad'], true);
  assert.equal(tool._meta.ui.resourceUri, 'ui://agentwhy/card-1.2.3.html');
  assert.equal((await call(server().messages, { about: 'summary' }))._meta['anthropic/alwaysLoad'], undefined);
});

// "nie mozna otworzyc raportu", 2026-11-24: a card stays in the chat, and the page it links to stops half an hour after it was last asked.
test('a card is told when its links were good, and which conversation to ask the AI about once they are not', async () => {
  const { messages } = server({ peek: async () => LIST, self: async () => KEY });
  assert.equal((await call(messages, { about: 'okay' }))._meta['agentwhy/answer'].at, 1_795_555_000_000);
  const own = (await call(messages, { about: 'summary' }))._meta['agentwhy/answer'];
  assert.deepEqual([own.at, own.self], [1_795_555_000_000, KEY]);
  const none = server({ address: async () => undefined });
  assert.equal((await call(none.messages, { about: 'okay' }))._meta['agentwhy/answer'].at, undefined);
});

test('the report of one conversation is opened by its name, this one among them', async () => {
  const { messages, asked } = server({ peek: async () => LIST, self: async () => KEY });
  await call(messages, { about: 'report', conversation: '#4f2a91c0' });
  assert.deepEqual(asked.filter((one) => one.startsWith('open')), [`open project ${KEY}`]);
});

test('a whole id opens its report with no page running to name it; anything shorter, or any other question about it, does not', async () => {
  const { messages, asked } = server({ peek: async () => undefined });
  await call(messages, { about: 'report', conversation: KEY });
  await call(messages, { about: 'report', conversation: `codex-${KEY}` });
  assert.deepEqual(asked, [`open project ${KEY}`, `open project codex-${KEY}`]);
  for (const args of [{ about: 'report', conversation: '4f2a91c0' }, { about: 'summary', conversation: KEY }]) assert.equal((await call(messages, args)).isError, true);
  assert.equal(asked.length, 2);
});

// The second review: a question that needed eight numbers dropped its card for titles it does not draw.
test('the terminal is sent the rows its card draws, and the app all of them', async () => {
  const row = (group: string, n: number) => ({ ...LIST.rows[0], key: `k-${n}`, ref: `k-${n}`, group });
  const list = { ...LIST, rows: [row('attention', 1), row('none', 2), row('stopped', 3), row('attention', 4)], recent: 3 } as unknown as ListAnswer;
  const { messages } = server({ list: async (scope) => ({ ...list, scope, beside: { ...list, scope } }) });
  const rowsFor = async (about: string) => (await call(messages, { about })).content[0]._meta['agentwhy/answer'].list;
  assert.deepEqual([(await rowsFor('okay')).rows.length, (await rowsFor('okay')).beside.rows.length, (await rowsFor('often')).rows.length], [0, 0, 0]);
  assert.deepEqual((await rowsFor('attention')).rows.map((one: { key: string }) => one.key), ['k-1', 'k-4']);
  assert.deepEqual((await rowsFor('conversations')).rows.length, 3);
  assert.deepEqual([(await rowsFor('okay')).often.length, (await call(messages, { about: 'okay' }))._meta['agentwhy/answer'].list.rows.length], [0, 4]);
});

test('the report\'s own card is told when its link was good, and of which conversation it is', async () => {
  const { messages } = server({ peek: async () => LIST });
  const answer = (await call(messages, { about: 'report', conversation: '#4f2a91c0' }))._meta['agentwhy/answer'];
  assert.deepEqual([answer.at, answer.key], [1_795_555_000_000, KEY]);
});

// CVB16: Codex starts the server for one thread and names it with the call; the card's own report is the page's `codex-…`.
const THREAD = '01a21249-4d8f-7933-b84f-5f9abcf4b33f';
const codexMeta = (more: object = {}) => ({ callId: 'call_AbCdEfGh1', threadId: THREAD, sessionId: THREAD, 'x-codex-turn-metadata': { thread_id: THREAD }, ...more });

test('in Codex this conversation is the thread its call names', async () => {
  const told: unknown[] = [];
  const { messages } = server({ self: async () => { told.push('self'); return 'started-in'; },
    conversation: async (key, callId) => { told.push(key, callId); return CONVERSATION; } });
  const result = (await ask(messages, 'tools/call', { name: 'what_happened', arguments: { about: 'summary' }, _meta: codexMeta() })).result;
  assert.deepEqual(told, [`codex-${THREAD}`, 'call_AbCdEfGh1'], 'the conversation another AI started this in is never asked for');
  assert.equal(result._meta['agentwhy/answer'].self, `codex-${THREAD}`);
});

test('a thread an app names in no shape of Codex\'s is no conversation of Codex\'s', async () => {
  for (const _meta of [codexMeta({ threadId: '../../x' }), { threadId: THREAD }, codexMeta({ 'x-codex-turn-metadata': 'x' })]) {
    const asked: unknown[] = [];
    const { messages } = server({ self: async () => 'started-in', conversation: async (key) => { asked.push(key); return CONVERSATION; } });
    await ask(messages, 'tools/call', { name: 'what_happened', arguments: { about: 'summary' }, _meta });
    assert.deepEqual(asked, ['started-in']);
  }
});

test('where Codex draws no card the AI is told to give the words, and everywhere else that the person sees it', async () => {
  const described = async (params: object) => {
    const { messages } = server();
    await ask(messages, 'initialize', params);
    return (await ask(messages, 'tools/list')).result.tools[0].description as string;
  };
  const ui = { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } };
  const terminal = await described({ clientInfo: { name: 'codex-mcp-client' }, capabilities: {} });
  assert.match(terminal, /no card is drawn/);
  assert.doesNotMatch(terminal, /sees (the|a) card|as a card|never retell/);
  assert.match(terminal, /Never call anything safe, clean or secure/);
  for (const params of [{ clientInfo: { name: 'codex-mcp-client' }, capabilities: ui }, { clientInfo: { name: 'claude-code' }, capabilities: {} }, {}]) {
    assert.match(await described(params), /The person sees the card/);
  }
});

test('an answer is in the language the AI says the person writes in, else in the one chosen for agentwhy', async () => {
  const asked: unknown[] = [];
  const { messages } = server({ lang: async () => 'de', conversation: async (_key, _call, lang) => { asked.push(lang); return CONVERSATION; } });
  const polish = await call(messages, { about: 'summary', lang: 'pl' });
  assert.equal(polish._meta['agentwhy/answer'].lang, 'pl');
  assert.match(polish.content[0].text, /Twoje AI/);
  assert.equal((await call(messages, { about: 'summary' }))._meta['agentwhy/answer'].lang, 'de');
  assert.equal((await call(messages, { about: 'conversations', lang: 'pl' }))._meta['agentwhy/answer'].lang, 'pl');
  assert.equal((await call(messages, { about: 'summary', lang: 'fr' }))._meta['agentwhy/answer'].lang, 'de', 'one agentwhy does not speak is no reason to answer nothing');
  assert.deepEqual(asked, ['pl', 'de', 'de']);
});

test('only the list of the last conversations is answered before every conversation is read', async () => {
  const waited: unknown[] = [];
  const { messages } = server({ list: async (scope, with_) => { waited.push(with_?.newest); return { ...LIST, scope }; } });
  for (const about of ['conversations', 'okay', 'attention', 'often']) await call(messages, { about });
  assert.deepEqual(waited, [10, undefined, undefined, undefined]);
});

// CVB31's rest: a cell's code is handed the text block whole, its `_meta` with it, and what it prints reaches the model.
test('Codex is sent nothing of the terminal card, which its code could print to the model', async () => {
  const said = async (name: string) => {
    const { messages } = server();
    await ask(messages, 'initialize', { clientInfo: { name } });
    return (await call(messages, { about: 'summary', lang: 'en' })).content;
  };
  assert.deepEqual(Object.keys((await said('codex-mcp-client'))[0]), ['type', 'text']);
  assert.deepEqual(Object.keys((await said('claude-code'))[0]), ['type', 'text', '_meta']);
});
