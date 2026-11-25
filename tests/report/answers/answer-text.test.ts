// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ANSWERS, isConversationAnswer, type AnswerKind } from '../../../src/report/answers/answer-kinds.ts';
import type { AnswerGroup, AnswerRow, ConversationAnswer, ListAnswer } from '../../../src/report/answers/answer-model.ts';
import { answerText, askOf } from '../../../src/report/answers/answer-text.ts';
import { ANSWER_WORDS } from '../../../src/report/answers/answer-words.ts';
import { LANGS, translator } from '../../../src/report/render/report-copy.ts';
import type { Look } from '../../../src/report/render/ui/status-look.ts';

// `specs/2026-11-24-talking-about-agentwhy.md` CV5, CV11: every answer in words.

const groups = (more: Partial<Record<AnswerGroup, number>> = {}): Record<AnswerGroup, number> =>
  ({ attention: 0, fixed: 0, tracked: 0, stopped: 0, seen: 0, none: 0, partly: 0, failed: 0, ...more });
const files = (more: Partial<AnswerRow['files']> = {}): AnswerRow['files'] => ({ read: 0, changed: 0, unknown: 0, opened: 0, stopped: 0, name: 0, ...more });
const list = (more: Partial<ListAnswer> = {}): ListAnswer => ({
  about: 'list', scope: 'project', asked: '7d', checked: { read: 3, of: 3 }, groups: groups({ attention: 1, none: 1, partly: 1 }),
  rows: [
    { key: '4f2a91c0-0000-4000-8000-000000000001', ref: '4f2a91c0', report: true, title: 'Fix *payments*', provider: 'claude-code', day: { year: 2026, month: 11, day: 24 }, relative: 'today', time: '09:12', held: 'terminal', look: 'read', group: 'attention', read: 2, files: files({ read: 2, stopped: 1 }), all: 41, helpers: 3 },
    { key: 'codex-77aa11bb-0000', ref: '77aa11bb', report: true, provider: 'codex', day: { year: 2026, month: 11, day: 20 }, time: '17:40', look: 'none', group: 'none', read: 0, files: files(), all: 5, helpers: 0 },
    { key: 'c3', ref: 'c3', report: false, title: 'Old import', provider: 'claude-code', day: { year: 2026, month: 11, day: 19 }, time: '08:05', look: 'unchecked', group: 'partly', read: 0, files: files(), helpers: 0 },
  ],
  recent: 3, rowsMore: 0,
  often: [{ path: '.env', wanted: 17, read: 12, changed: 0, opened: 0, stopped: 5, named: 3, unknown: 0, tracked: false, conversations: 4 }],
  oftenMore: 0, namedOnly: 2, ...more,
});
const conversation = (more: Partial<ConversationAnswer> = {}): ConversationAnswer => ({
  about: 'conversation', look: 'read', numbers: { read: 2, name: 1, stopped: 1, opened: 0, unknown: 0, changed: 0, helpers: 1 },
  steps: { n: 5, leftOut: 0, list: [], moments: [{ from: 3, to: 4, tone: 'coral', label: 'sb.tag.read', said: 'Read 2 private files', files: ['.env'], first: true }], momentsMore: 0, reads: 2, ordinary: 3, helperSteps: 0 },
  files: [{ path: '.env', access: 'read' }, { path: 'keys.pem', place: 'outside', access: 'stopped' }], filesMore: 0,
  helpers: [{ helper: 1, asked: 'Check the *settings*', files: [{ path: 'config/.env', access: 'read' }], filesMore: 0 }], helpersMore: 0,
  todo: [{ path: '.env', kind: 'keys' }], todoMore: 0, todoKeys: 1, all: 41, ...more,
});
const say = (kind: AnswerKind, lang: (typeof LANGS)[number] = 'en', more: object = {}): string =>
  answerText(isConversationAnswer(kind) ? conversation(more) : list(more), kind, translator(lang));

const FORBIDDEN = [/\bsafe(ly)?\b/i, /\bsecure/i, /\bclean\b/i, /nothing leaked/i, /bezpieczn/i, /\bczyst[aeoy]/i, /nic nie wyciekło/i, /\bsicher/i, /\bsauber/i, /nichts durchgesickert/i];

test('no word of it, in any language, calls anything safe', () => {
  for (const lang of LANGS) for (const words of Object.values(ANSWER_WORDS[lang])) for (const word of FORBIDDEN) assert.ok(!word.test(words), `${lang}: ${words}`);
});

test('every answer over every look is said, in every language, and says no forbidden word', () => {
  const looks: Look[] = ['read', 'guard', 'fixed', 'allowed', 'opened', 'name', 'stopped', 'none', 'unchecked'];
  for (const lang of LANGS) for (const kind of ANSWERS) for (const look of looks) {
    const text = say(kind, lang, isConversationAnswer(kind) ? { look } : {});
    assert.ok(text.trim().length > 0 && text.endsWith('\n'));
    assert.ok(!/\ban\.[a-z]/.test(text) && !/\{[a-z]+\}/.test(text), `a key or a blank left in ${lang} ${kind}: ${text}`);
    for (const word of FORBIDDEN) assert.ok(!word.test(text), `${lang} ${kind}: ${text}`);
  }
});

test('okay leads with what to act on, and what could not be checked is always said', () => {
  const text = say('okay');
  assert.ok(text.indexOf('In 1 of them there is something for you to do') > 0);
  assert.ok(text.indexOf('1 to act on') < text.indexOf('1 nothing private'));
  assert.match(text, /1 not fully checked/);
  assert.match(text, /1 nothing private in the record/);
  assert.ok(say('okay', 'en', { groups: groups({ none: 3 }) }).includes('Nothing in them asks you to act'));
  assert.ok(!say('okay', 'en', { groups: groups({ none: 2, partly: 1 }) }).includes('Nothing in them asks you to act'));
});

test('over nothing it says there is nothing to check, and while reading it says so', () => {
  assert.match(say('okay', 'en', { checked: { read: 0, of: 0 }, groups: groups(), rows: [] }), /nothing to check/);
  const reading = say('okay', 'en', { checked: { read: 0, of: 9 }, groups: groups(), rows: [] });
  assert.match(reading, /still reading/);
  assert.ok(!/worked for you/.test(reading));
  assert.match(say('okay', 'en', { checked: { read: 12, of: 58 } }), /Checked 12 of 58/);
  assert.ok(!/Checked/.test(say('okay')));
});

test('a row is its title, set so nothing in it reads as markup, and its look', () => {
  assert.match(say('conversations'), /Fix \\\*payments\\\*.*#4f2a91c0$/m);
  assert.match(say('conversations'), /#77aa11bb$/m);
  assert.match(say('attention'), /Fix/);
  assert.ok(!/Old import/.test(say('attention')));
  assert.match(say('tracked'), /None among those checked/);
  assert.match(say('conversations'), /These titles are now part of this chat/);
});

test('often says its parts, and who stopped it is not said', () => {
  const text = say('often');
  assert.match(text, /`\.env`/);
  assert.match(text, /17 times/);
  assert.match(text, /12 read/);
  assert.match(text, /5 stopped/);
  assert.match(text, /2 more files it only saw by name/);
  assert.ok(!/agentwhy stopped/.test(text));
  assert.match(say('often', 'en', { often: [], namedOnly: 0 }), /wanted no private or tracked file/);
});

test('plurals are the language\'s own', () => {
  const steps = (n: number) => answerText(conversation({ steps: { ...conversation().steps, n } }), 'steps', translator('pl'));
  assert.match(steps(1), /1 krok\./);
  assert.match(steps(3), /3 kroki\./);
  assert.match(steps(25), /25 kroków\./);
});

test('a file that is not in the project says where it lies', () => {
  assert.match(say('files'), /`keys\.pem` \(/);
});

test('a record not fully checked says why', () => {
  assert.match(say('summary', 'en', { look: 'unchecked', notChecked: ['a command printed files it did not name'] }), /Couldn’t check fully: a command printed/);
});

test('the numbers of a conversation agree with their word in Polish', () => {
  const said = (n: number) => answerText(conversation({ numbers: { ...conversation().numbers, read: n, stopped: n } }), 'summary', translator('pl'));
  assert.match(said(1), /1 przeczytany · .*1 zatrzymany/);
  assert.match(said(4), /4 przeczytane · .*4 zatrzymane/);
  assert.match(said(8), /8 przeczytanych · .*8 zatrzymanych/);
});

test('CV5: a list of one group says how many more the group counts than it names', () => {
  for (const kind of ['attention', 'tracked', 'stopped'] as const) {
    const row = list().rows[0]!;
    const text = say(kind, 'en', { groups: groups({ [kind]: 9 }), rows: [{ ...row, group: kind }], rowsMore: 30 });
    assert.match(text, /- 8 more$/m, kind);
    const none = say(kind, 'en', { groups: groups({ [kind]: 2 }), rows: [], rowsMore: 30 });
    assert.match(none, /- 2 more$/m, kind);
    assert.ok(!none.includes('None among those checked'), 'the group holds two');
  }
});

test('TK2: whatever was asked about a conversation, what could not be checked is said', () => {
  for (const kind of ['summary', 'steps', 'files', 'helpers', 'todo'] as const) {
    assert.ok(say(kind, 'en', { notChecked: ['two commands opened files they did not name'] }).includes('two commands opened files they did not name'), kind);
    assert.ok(say(kind, 'en', { notChecked: ['two commands opened files they did not name'], steps: { ...conversation().steps, n: 0 } }).includes('two commands'), kind);
  }
});

test('CV7: an answer about another conversation names it, and never says it is this one', () => {
  const t = translator('en');
  assert.match(answerText(conversation(), 'summary', t, { title: 'Fix *payments*' }), /^\*\*agentwhy\*\* · Fix \\\*payments\\\*$/m);
  const untitled = answerText(conversation(), 'steps', t, {});
  assert.match(untitled, /^\*\*agentwhy\*\* · A conversation with no title$/m);
  assert.ok(!untitled.includes('this conversation'));
});

// Seen 2026-11-24 in Claude Code's terminal: "Your AI read 1 private file. Change the keys in 1 of them."
test('one file read and one thing to do is said of that file', () => {
  const one = { ...conversation(), numbers: { ...conversation().numbers, read: 1 }, todo: [{ path: '.env', kind: 'keys' as const }] };
  assert.deepEqual(LANGS.map((lang) => askOf(one, translator(lang))), ['Change the keys in it.', 'Zmień klucze, które w nim są.', 'Ändere die Schlüssel darin.']);
  const data = { ...one, todo: [{ path: 'customers.csv', kind: 'data' as const }], todoKeys: 0 };
  assert.deepEqual(LANGS.map((lang) => askOf(data, translator(lang))), ['Check what it holds.', 'Sprawdź, co w nim jest.', 'Prüfe, was darin steht.']);
  assert.equal(askOf({ ...one, numbers: { ...one.numbers, read: 3 } }, translator('en')), 'Change the keys in 1 of them.');
});

// The review of 2026-11-24.
test('what it asks counts every thing to do, and a step that only wrote is none that read', () => {
  const t = translator('en');
  const ten = { ...conversation(), numbers: { ...conversation().numbers, read: 10 }, todo: Array.from({ length: 6 }, (_, n) => ({ path: `${n}/.env`, kind: 'keys' as const })), todoMore: 4, todoKeys: 10 };
  assert.equal(askOf(ten, t), 'Change the keys in 10 of them.');
  assert.equal(askOf({ ...ten, todoKeys: 0, todo: ten.todo.map((item) => ({ ...item, kind: 'data' as const })) }, t), 'Check what 10 of them hold.');
  const wrote = say('steps', 'en', { steps: { ...conversation().steps, list: [{ tone: 'coral', label: 'x' }, { tone: 'coral', label: 'x' }], reads: 0 } });
  assert.ok(!wrote.includes('read private files'), wrote);
});

test('TK2: steps say what of the ordinary ones is not known, and whose they were', () => {
  const text = say('steps', 'en', { steps: { ...conversation().steps, helperSteps: 30, notKnown: ['In 1 of the other steps we can’t see which files were opened'] } });
  assert.match(text, /^- 3 other steps named no private file$/m);
  assert.match(text, /^- 30 steps of helpers named no private file$/m);
  assert.match(text, /In 1 of the other steps we can’t see which files were opened/);
});

test('TK2: no list says none without saying what could not be checked', () => {
  const unsure = { groups: groups({ partly: 2, failed: 2 }), checked: { read: 4, of: 4 }, rows: [], recent: 0, rowsMore: 0, often: [], namedOnly: 0 };
  for (const kind of ['conversations', 'attention', 'tracked', 'stopped', 'often'] as const) {
    const text = say(kind, 'en', unsure);
    assert.match(text, /^- 2 not fully checked$/m, kind);
    assert.match(text, /^- 2 couldn’t be read$/m, kind);
  }
});

test('CV15: this computer is said as its two lists, each under its own name, and an empty one never stands for both', () => {
  const beside = list({ scope: 'computer', list: 'projects' });
  const text = say('okay', 'en', { scope: 'computer', list: 'outside', checked: { read: 0, of: 0 }, groups: groups(), rows: [], recent: 0, often: [], namedOnly: 0, beside });
  assert.match(text, /^\*\*agentwhy\*\* · this computer, outside your projects, the last 7 days$/m);
  assert.match(text, /^\*\*this computer, your projects\*\*$/m);
  assert.match(text, /In 1 of them there is something for you to do/);
  assert.equal(text.split('agentwhy reads Claude Code').length, 2, 'said once');
});

// The maintainer's run of 2026-11-24: from 1 conversation of 35 the answer opened with "Your AI worked for you 1 time".
test('an answer from some of the conversations opens with that, and counts the AI\'s work in no sentence', () => {
  const text = say('okay', 'en', { checked: { read: 12, of: 58 } });
  assert.match(text.split('\n').find((line) => line.startsWith('**') && !line.includes('agentwhy')) ?? '', /Checked 12 of 58 conversations/);
  assert.doesNotMatch(text, /worked for you/);
  assert.equal(text.split('Checked 12 of 58').length, 2);
});

test('a row says the day, the time, which AI and where', () => {
  const text = say('conversations');
  assert.match(text, /\(today 09:12, Claude Code · terminal\): Read private files - 2 read, 1 stopped, 41 files, 3 helpers #/);
  assert.match(text, /\(2026-11-20 17:40, Codex\): /);
});

test('the summary names its private files with what happened to each, and says how much there was beside them', () => {
  const text = say('summary');
  assert.match(text, /`\.env` - read/);
  assert.match(text, /`keys\.pem` \(outside this project\) - stopped/);
  assert.match(text, /5 steps · 41 files/);
  assert.match(say('summary', 'en', { look: 'none', numbers: { read: 0, name: 0, stopped: 0, opened: 0, unknown: 0, changed: 0, helpers: 0 }, files: [], todo: [], todoKeys: 0 }), /Nothing private[\s\S]*5 steps · 41 files/);
});

// PRD4: while rows are read again with new rules, each keeps what the old ones said.
test('an answer taken while conversations are read again says so, whatever was asked, and never that nothing asks to act', () => {
  for (const kind of ['okay', 'conversations', 'attention', 'often'] as const) {
    const text = say(kind, 'en', { reading: true, groups: groups({ none: 3 }) });
    assert.match(text, /reading some of them again/, kind);
    assert.doesNotMatch(text, /Nothing in them asks/, kind);
  }
  assert.match(say('okay', 'en', { groups: groups({ none: 3 }) }), /Nothing in them asks/);
});

// 3: two outside files of one name are two.
test('two files of one name are two lines, and none is left out of the count of the rest', () => {
  const env = (access: 'read' | 'stopped') => ({ path: '.env', place: 'outside' as const, access });
  const text = say('summary', 'en', { files: [env('read'), env('stopped')], todo: [{ path: '.env', place: 'outside', kind: 'keys' }], todoKeys: 1 });
  assert.match(text, /`\.env` \(outside this project\) - read - Make new keys/);
  assert.match(text, /`\.env` \(outside this project\) - stopped\n/);
  const many = say('summary', 'en', { files: Array.from({ length: 9 }, () => env('stopped')), todo: [], todoKeys: 0 });
  assert.equal(many.split('`.env`').length - 1, 6);
  assert.match(many, /- 3 more/);
});

test('a helper that met no private file is said as that', () => {
  const text = say('helpers', 'en', { numbers: { ...conversation().numbers, helpers: 2 }, helpers: [...conversation().helpers, { helper: 2, asked: 'Draw the logo', files: [], filesMore: 0 }] });
  assert.match(text, /^- Helper 2 \(Task: Draw the logo\): no private file in its record$/m);
  const none = say('helpers', 'en', { numbers: { ...conversation().numbers, helpers: 1 }, helpers: [{ helper: 1, files: [], filesMore: 0 }] });
  assert.match(none, /Your AI had 1 helper/);
  assert.match(none, /In the record no helper met a private file/);
});

test('in words too, who met a file is said', () => {
  const files = [{ path: '.env', access: 'read' as const, by: [0, 2] }, { path: 'a.pem', access: 'stopped' as const }];
  assert.match(say('files', 'en', { files }), /^- `\.env` - read \(Your AI, Helper 2\)$/m);
  assert.match(say('files', 'en', { files }), /^- `a\.pem` - stopped$/m);
  assert.match(say('helpers', 'en', { mine: [{ path: '.env', access: 'read' }] }), /^- Your AI: `\.env` read$/m);
});

test('a helper of no recorded action, and who met a file of the summary, are said in words', () => {
  const text = say('helpers', 'en', { helpers: [{ helper: 1, asked: 'Deploy', files: [], filesMore: 0, unrecorded: true }] });
  assert.match(text, /^- Helper 1 \(Task: Deploy\): Its actions were not recorded\.$/m);
  assert.doesNotMatch(text, /no helper met a private file|no private file in its record/);
  assert.match(say('summary', 'en', { files: [{ path: 'shop.env', access: 'read', by: [0] }], todo: [], todoMore: 0, todoKeys: 0 }), /^- `shop\.env` - read \(Your AI\)$/m);
});
