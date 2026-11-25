// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ConversationAnswer, ListAnswer } from '../../../../src/report/answers/answer-model.ts';
import { ANSWERS, isConversationAnswer } from '../../../../src/report/answers/answer-kinds.ts';
import { cardPage } from '../../../../src/report/render/card/card-page.ts';
import { LANGS } from '../../../../src/report/render/report-copy.ts';
import { drawCard } from '../../../helpers/card-dom.ts';
import { DEMOS } from '../../../hooks/demo-answers.ts';

// `specs/2026-11-24-talking-about-agentwhy.md` CV4, CV12: what the app's card draws, run and not read. The second review of 2026-11-25.

const conversation = DEMOS['conversation'] as ConversationAnswer;
const calm = DEMOS['calm'] as ListAnswer;
const PAGES = 'http://127.0.0.1:43123/token/';
const grey = (n: number) => Array.from({ length: n }, () => ({ tone: 'grey' as const, label: 'look.none' }));

test('every answer is drawn in every language, each with something said and no word left out', () => {
  for (const lang of LANGS) for (const kind of ANSWERS) for (const [name, answer] of Object.entries(DEMOS)) {
    if ((answer.about === 'conversation') !== isConversationAnswer(kind)) continue;
    const drawn = drawCard({ about: kind, lang, [answer.about]: answer }, { lang });
    assert.ok(drawn.text().trim().length > 0, `${lang} ${kind} ${name}`);
    assert.doesNotMatch(drawn.text(), /undefined|NaN|\{[a-z]+\}|\[object/, `${lang} ${kind} ${name}`);
  }
});

test('steps left out are never among those that named no private file', () => {
  const cut = { ...conversation, numbers: { ...conversation.numbers, read: 1 }, steps: { ...conversation.steps, n: 400, leftOut: 51, list: grey(400), moments: [] } };
  const drawn = drawCard({ about: 'summary', lang: 'en', conversation: cut });
  assert.doesNotMatch(drawn.text(), /None of its/);
  assert.match(drawn.text(), /51 steps/);
  const whole = { ...cut, steps: { ...cut.steps, n: 9, leftOut: 0, list: grey(9) } };
  assert.match(drawCard({ about: 'summary', lang: 'en', conversation: whole }).text(), /None of its 9 steps/);
});

test('two files of one name are two rows, and none of them is hidden by a thing to do', () => {
  const env = (access: 'read' | 'stopped') => ({ path: '.env', place: 'outside' as const, access });
  const two = { ...conversation, steps: { ...conversation.steps, list: [], moments: [] }, files: [env('read'), env('stopped')], filesMore: 0, todo: [{ path: '.env', place: 'outside' as const, kind: 'keys' as const }], todoMore: 0, todoKeys: 1 };
  const text = drawCard({ about: 'summary', lang: 'en', conversation: two }).text();
  assert.equal(text.split('.env').length - 1, 2);
  assert.match(text, /stopped/);
});

test('a list read again says so and is not calm', () => {
  for (const kind of ['okay', 'conversations', 'often'] as const) {
    assert.match(drawCard({ about: kind, lang: 'en', list: { ...calm, reading: true } }).text(), /reading some of them again/, kind);
  }
  assert.doesNotMatch(drawCard({ about: 'okay', lang: 'en', list: { ...calm, reading: true } }).text(), /Nothing in them asks/);
  assert.match(drawCard({ about: 'okay', lang: 'en', list: calm }).text(), /Nothing in them asks/);
});

const asked = (drawn: ReturnType<typeof drawCard>) => drawn.posted.filter((one) => one.method === 'ui/open-link' || one.method === 'ui/message').map((one) => (one.method === 'ui/message' ? one.params.content[0].text : one.params.url));
test('a report is opened while its page can be running, and past that asked for: from a conversation, and from the report\'s own card', () => {
  const answer = { about: 'summary', lang: 'en', conversation, key: 'abc', pages: PAGES, at: 1_000 };
  const report = { about: 'report', lang: 'en', said: 'The page is ready.', link: PAGES + 'abc.html', key: 'abc', pages: PAGES, at: 1_000 };
  for (const one of [answer, report]) {
    const fresh = drawCard(one, { now: 60_000 });
    fresh.press('Open report');
    assert.deepEqual(asked(fresh), [PAGES + 'abc.html']);
    const stale = drawCard(one, { now: 26 * 60_000 });
    stale.press('Open report');
    assert.deepEqual(asked(stale), ['Open agentwhy’s report of the conversation #abc']);
  }
});

test('a read of files the person tracks is not drawn as one to act on', () => {
  const tracked = { ...conversation, look: 'allowed' as const, files: [{ path: 'notes.md', access: 'read' as const }], todo: [], todoKeys: 0, filesMore: 0 };
  const drawn = drawCard({ about: 'summary', lang: 'en', conversation: tracked });
  assert.doesNotMatch(drawn.text(), /!/);
});

// The maintainer, 2026-11-25: the tabs at the top, and an icon that opens the card larger.
test('the tabs stand over what they change, each with how many it holds, and the one pressed is the one shown', () => {
  const page = cardPage('en');
  assert.ok(page.indexOf('id="tabs"') < page.indexOf('id="view"'));
  const drawn = drawCard({ about: 'summary', lang: 'en', conversation: { ...conversation, files: conversation.files.slice(0, 3), filesMore: 2 } });
  const tabs = () => drawn.buttons().filter((one) => one.parent?.className === 'tabs' || one.parent?.attributes.get('data-tabs') !== undefined);
  assert.deepEqual(tabs().map((one) => one.textContent), ['Summary', 'Steps', 'Files5', 'Helpers4', 'To do3']);
  tabs()[2]?.click();
  assert.deepEqual(tabs().map((one) => one.getAttribute('aria-current')), [null, null, 'true', null, null]);
});

test('the icon that opens the card larger is there where the app can, and asks for that alone', async () => {
  const drawnIn = async (modes: readonly string[] | undefined) => {
    const drawn = drawCard({ about: 'summary', lang: 'en', conversation }, { host: modes === undefined ? {} : { hostContext: { availableDisplayModes: modes, displayMode: 'inline' } } });
    await new Promise((done) => setImmediate(done));
    return drawn;
  };
  for (const modes of [undefined, ['inline']]) assert.equal((await drawnIn(modes)).buttons().some((one) => one.getAttribute('aria-label') === 'Open larger' && !one.hidden), false);
  const can = await drawnIn(['inline', 'fullscreen']);
  (can.buttons().find((one) => one.getAttribute('aria-label') === 'Open larger') as { click(): void }).click();
  assert.deepEqual(can.posted.filter((one) => one.method === 'ui/request-display-mode').map((one) => one.params.mode), ['fullscreen']);
});

const step = { from: 333, to: 333, tone: 'blue' as const, said: 'Saw the names of 5 files.', files: ['.env.production'], met: [
  { path: '.env.production', access: 'name' as const }, { path: 'keys/deploy.pem', access: 'name' as const }, { path: '.npmrc', place: 'outside' as const, access: 'stopped' as const }, { path: 'src/app.ts', access: 'read' as const, everyday: true as const }], metMore: 1, ran: ['Bash · rg'], label: 'look.name', wrote: { text: 'Looking for the settings first.' } };
test('a step opened says each file it met and what happened to it, what it ran, and leads to the report', () => {
  const drawn = drawCard({ about: 'steps', lang: 'en', conversation: { ...conversation, steps: { ...conversation.steps, moments: [step] } }, key: 'abc', pages: PAGES, at: 500 }, { now: 1_000 });
  (drawn.buttons().find((one) => one.textContent.startsWith('○')) as { click(): void }).click();
  for (const word of ['keys/deploy.pem', '.npmrc', 'src/app.ts', 'stopped', 'Bash · rg', '1 more']) assert.ok(drawn.text().includes(word), word);
  const colours = (word: string) => drawn.spans().filter((one) => one.textContent.trim() === word).map((one) => one.className);
  assert.deepEqual(colours('read'), ['dim'], 'an everyday file is not drawn as one to act on');
  drawn.press('Open this in the report');
  assert.deepEqual(asked(drawn), [PAGES + 'abc.html']);
});

// "i otworz raport nie dziala", 2026-11-25: the app was asked, and nothing was seen to open.
test('a press on the report always leaves a way that works: an app that says it opens no links is not asked, and a refusal asks the AI', async () => {
  const answer = { about: 'summary', lang: 'en', conversation, key: 'abc', pages: PAGES, at: 500 };
  const tick = () => new Promise((done) => setImmediate(done));
  const without = drawCard(answer, { now: 1_000, host: { hostCapabilities: {} } });
  await tick();
  without.press('Open report');
  assert.deepEqual(asked(without), ['Open agentwhy’s report of the conversation #abc']);
  const opens = drawCard(answer, { now: 1_000, host: { hostCapabilities: { openLinks: {} } } });
  await tick();
  opens.press('Open report');
  assert.deepEqual(asked(opens), [PAGES + 'abc.html']);
  assert.match(opens.text(), /Nothing opened\?/);
  opens.press('Open it through the chat');
  assert.deepEqual(asked(opens), [PAGES + 'abc.html', 'Open agentwhy’s report of the conversation #abc']);
  const refused = drawCard(answer, { now: 1_000 });
  refused.press('Open report');
  refused.answerLast({ isError: true });
  await tick();
  assert.deepEqual(asked(refused).length, 2);
});

// The maintainer, 2026-11-25: the steps as the report draws them.
test('steps are told as the report tells them: what the AI wrote, first and then, the files in sight, the look, and how many stood between', () => {
  const moments = [{ ...step, from: 1, to: 1 }, { ...step, from: 9, to: 10, said: 'Read .env', tone: 'coral' as const, label: 'sb.tag.read', wrote: undefined }, { ...step, from: 2, to: 2, helper: 3, wrote: undefined }];
  const drawn = drawCard({ about: 'steps', lang: 'en', conversation: { ...conversation, steps: { ...conversation.steps, moments } } });
  const text = drawn.text();
  for (const word of ['Your AI said', 'Looking for the settings first.', 'First', 'Then', 'step 1', 'steps 9–10', 'Helper 3', '.env.production', 'keys/deploy.pem']) assert.ok(text.includes(word), `${word}: ${text}`);
  assert.match(text, /7 steps, none named a private file/);
  assert.doesNotMatch(text, /undefined/);
});

test('the map says how many steps of each look there are', () => {
  const list = [...grey(3), { tone: 'coral' as const, label: 'sb.tag.read' }, { tone: 'coral' as const, label: 'sb.tag.read' }];
  assert.match(drawCard({ about: 'summary', lang: 'en', conversation: { ...conversation, steps: { ...conversation.steps, n: 5, leftOut: 0, list } } }).text(), /2 Read a private file|2 Read private file/);
  const text = drawCard({ about: 'summary', lang: 'en', conversation: { ...conversation, steps: { ...conversation.steps, n: 5, leftOut: 0, list } } }).text();
  assert.match(text, /3 named no private file/);
  assert.doesNotMatch(text, /3 Nothing private/);
});

// The maintainer, 2026-11-25: the other views as the report draws them, on its sky.
test('the card stands on the report\'s own background', () => {
  assert.match(cardPage('en'), /class="bd"/);
  assert.ok(cardPage('en').length < 120_000);
});

test('files stand under what happened to them and the folder they are in, each once, and the numbers are theirs', () => {
  const files = [{ path: 'apps/web/.env', access: 'read' as const }, { path: 'apps/web/.env.local', access: 'stopped' as const }, { path: '.env', access: 'read' as const }, { path: '.npmrc', place: 'outside' as const, access: 'read' as const }];
  const drawn = drawCard({ about: 'files', lang: 'en', conversation: { ...conversation, numbers: { ...conversation.numbers, read: 3, stopped: 1, name: 0 }, files, filesMore: 0 } });
  const text = drawn.text();
  assert.equal(drawn.spans().filter((one) => one.className === 'folder').map((one) => one.textContent).join('|'), 'The main folder|apps/web|Outside this project|apps/web');
  for (const word of ['.env.local', '.npmrc']) assert.equal(text.split(word).length - 1, 1, word);
  assert.match(text, /3 read[\s\S]*1 stopped/);
});

test('each thing to do has its own way to the report, and helpers are drawn under your AI, each with its task and files', () => {
  const todo = drawCard({ about: 'todo', lang: 'en', conversation, key: 'abc', pages: PAGES, at: 500 }, { now: 1_000 });
  assert.equal(todo.buttons().filter((one) => one.textContent === 'Fix it').length, conversation.todo.length);
  todo.press('Fix it');
  assert.deepEqual(asked(todo), [PAGES + 'abc.html']);
  const text = drawCard({ about: 'helpers', lang: 'en', conversation }).text();
  for (const word of ['Your AI', 'Helper 1', 'Sprawdź ustawienia płatności', 'config/stripe.json', 'Helper 3']) assert.ok(text.includes(word), word);
  assert.ok(text.indexOf('Your AI') < text.indexOf('Helper 1'));
});

test('every helper is drawn, the one that met no private file too', () => {
  const card = drawCard({ about: 'helpers', lang: 'en', conversation: { ...conversation, numbers: { ...conversation.numbers, helpers: 1 }, helpers: [{ helper: 1, asked: 'Draw the logo', files: [], filesMore: 0 }], helpersMore: 0 } });
  assert.match(card.text(), /Helper 1[\s\S]*Draw the logo[\s\S]*no private file in its record/);
  assert.match(card.text(), /In the record no helper met a private file/);
});

test('the card speaks the language of its answer, whatever the app was handed it in', () => {
  assert.match(drawCard({ about: 'okay', lang: 'pl', list: DEMOS['project'] }, { lang: 'en' }).text(), /Twoje AI pracowało/);
  assert.match(drawCard({ about: 'okay', lang: 'de', list: DEMOS['project'] }, { lang: 'pl' }).text(), /Deine KI/);
  for (const lang of ['en', 'pl', 'de'] as const) assert.ok(cardPage(lang).length < 120_000);
});

test('a list still being read offers to ask again', () => {
  const list = { ...(DEMOS['project'] as ListAnswer), checked: { read: 10, of: 54 }, reading: true };
  const card = drawCard({ about: 'okay', lang: 'en', list });
  card.press('Check again');
  assert.equal(card.posted.at(-1)?.params.content[0].text, 'Is everything okay in my conversations?');
  const rows = drawCard({ about: 'conversations', lang: 'en', list });
  assert.match(rows.text(), /^Your last conversations[^]*Checked 10 of 54[^]*today/, 'said before the rows');
  rows.press('Check again');
  assert.equal(rows.posted.at(-1)?.params.content[0].text, 'Show me my last conversations in agentwhy');
});

// The maintainer in Codex, 2026-11-25: each tab was of another height, so the chat jumped to its end whenever one was pressed.
test('the card keeps one height whatever tab is open, and what is taller is scrolled inside it', async () => {
  const card = drawCard({ about: 'summary', lang: 'en', conversation }, { host: { hostContext: { displayMode: 'inline' } } });
  const room = card.room();
  assert.match(room, /^\d+px$/);
  assert.ok(Number.parseInt(room, 10) <= 560);
  for (const tab of ['Steps', 'Helpers', 'To do', 'Summary']) {
    card.press(card.buttons().find((one) => one.textContent.startsWith(tab))?.textContent ?? tab);
    assert.equal(card.room(), room, tab);
    assert.equal(card.scrolled(), 0, 'a tab opens at its beginning');
  }
  assert.equal(drawCard({ about: 'okay', lang: 'en', said: 'Nothing here yet.' }).room(), '', 'one sentence needs no room kept');
  const whole = drawCard({ about: 'summary', lang: 'en', conversation }, { host: { hostContext: { displayMode: 'fullscreen', availableDisplayModes: ['inline', 'fullscreen'] } } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(whole.room(), '', 'the whole screen is the app\'s to fill');
});

test('the card says which AI met a file: in Files, in the summary and on the diagram', () => {
  const own = { ...conversation, files: [{ path: 'shop.env', access: 'read' as const, by: [0] }, { path: 'a.pem', access: 'stopped' as const, by: [0, 2] }], filesMore: 0, todo: [], todoMore: 0,
    helpers: [{ helper: 2, asked: 'Deploy', files: [{ path: 'a.pem', access: 'stopped' as const }], filesMore: 0 }], helpersMore: 0, mine: [{ path: 'shop.env', access: 'read' as const }], mineMore: 0 };
  assert.match(drawCard({ about: 'files', lang: 'en', conversation: own }).text(), /shop\.envYour AI[^]*a\.pemYour AI, Helper 2/);
  assert.match(drawCard({ about: 'summary', lang: 'en', conversation: own }).text(), /shop\.envread · Your AI/);
  const drawn = drawCard({ about: 'helpers', lang: 'en', conversation: own }).text();
  assert.match(drawn, /Your AIshop\.env read[^]*Helper 2/);
  assert.match(drawCard({ about: 'files', lang: 'en', conversation: { ...own, files: [{ path: 'b.pem', access: 'read' as const }] } }).text(), /b\.pem$|b\.pem(?!Your)/, 'where the record does not say, nothing is said');
});

test('each of this computer\'s two lists has its own room', () => {
  const row = (DEMOS['project'] as ListAnswer).rows[0] as ListAnswer['rows'][number];
  const big = { ...(DEMOS['computer'] as ListAnswer), list: 'projects' as const, rows: Array.from({ length: 20 }, () => row), recent: 20 };
  const small = { ...(DEMOS['empty'] as ListAnswer), scope: 'computer' as const, list: 'outside' as const };
  const card = drawCard({ about: 'conversations', lang: 'en', list: { ...small, beside: big } });
  const before = Number.parseInt(card.room(), 10);
  card.buttons().find((one) => one.textContent.startsWith('Projects'))?.click();
  assert.ok(Number.parseInt(card.room(), 10) > before, `${before} -> ${card.room()}`);
});

test('an app that is slow to answer about a link gets nothing said in the chat for the person', async () => {
  const card = drawCard({ about: 'summary', lang: 'en', conversation, key: 'abc', pages: PAGES, at: 500 }, { now: 1_000 });
  card.press('Open report');
  card.timeUp();
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(asked(card), [PAGES + 'abc.html']);
  assert.match(card.text(), /Nothing opened\?/, 'the way that works is the person\'s to take');
});

test('the button that opens the card larger is named in the card\'s language', async () => {
  const card = drawCard({ about: 'summary', lang: 'en', conversation }, { lang: 'en', host: { hostContext: { displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] } } });
  const named = () => card.buttons().find((one) => one.textContent === '⤢')?.getAttribute('aria-label');
  await new Promise((done) => setImmediate(done));
  assert.equal(named(), 'Open larger');
  card.hand({ about: 'summary', lang: 'pl', conversation });
  assert.equal(named(), 'Otwórz większą');
});

test('a heading of Files counts every file, the ones past the list too', () => {
  const many = { ...conversation, numbers: { ...conversation.numbers, read: 30, name: 2, stopped: 0 }, filesMore: 8,
    files: Array.from({ length: 24 }, (_, at) => ({ path: `k${at}.pem`, access: 'read' as const })) };
  assert.match(drawCard({ about: 'files', lang: 'en', conversation: many }).text(), /30 read[^]*2 only its name seen/);
});

test('a helper of no recorded action is drawn as that', () => {
  const own = { ...conversation, numbers: { ...conversation.numbers, helpers: 1 }, helpers: [{ helper: 1, files: [], filesMore: 0, unrecorded: true as const }], helpersMore: 0 };
  const drawn = drawCard({ about: 'helpers', lang: 'en', conversation: own }).text();
  assert.match(drawn, /Its actions were not recorded/);
  assert.doesNotMatch(drawn, /no helper met a private file|no private file in its record/);
});

test('a card drawn in a frame of no size yet takes its room once it has one', () => {
  const card = drawCard({ about: 'summary', lang: 'en', conversation }, { width: 0 });
  assert.equal(card.room(), '');
  card.resize(600);
  assert.match(card.room(), /^[1-9]\d*px$/);
});

test('the answer can be scrolled from the keyboard', () => {
  assert.match(cardPage('en'), /<div id="view" tabindex="0" role="region" aria-label="agentwhy">/);
});
