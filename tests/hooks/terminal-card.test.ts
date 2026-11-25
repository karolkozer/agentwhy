// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Answer, Conversation, Kind, List, Payload } from '../../hooks/terminal/answer.ts';
import type { Line } from '../../hooks/terminal/cells.ts';
import '../helpers/plugin-module.ts';
import { ANSWERS, isConversationAnswer } from '../../src/report/answers/answer-kinds.ts';
import { PROVIDER_NAMES } from '../../src/core/session-format.ts';
import type { ConversationAnswer, ListAnswer } from '../../src/report/answers/answer-model.ts';
import { askOf, factOf, GROUPS, isCalm, rangeOf, rowsOf, whereOf } from '../../src/report/answers/answer-text.ts';
import { LANGS, translator } from '../../src/report/render/report-copy.ts';
import { DEMOS } from './demo-answers.ts';

const { KINDS, META, payloadOf, PROVIDERS } = await import('../../hooks/terminal/answer.ts');
const { cardLines, cardWidth } = await import('../../hooks/terminal/card.ts');
const { clean, widthOf } = await import('../../hooks/terminal/cells.ts');
const { rowsOf: cardRows } = await import('../../hooks/terminal/list.ts');
const { OWN_WORDS } = await import('../../hooks/terminal/words.ts');

// `specs/2026-11-24-talking-about-agentwhy.md` CV4, CV5, CV12, CV13: the card in the terminal, as lines of cells.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const { repositoryWords } = (await import(new URL('../../scripts/terminal-card-words.mjs', import.meta.url).href)) as { repositoryWords: () => string };
const COLUMNS = [24, 32, 40, 56, 80, 100, 120, 200];
const demos: Readonly<Record<string, Answer>> = DEMOS;
const project = demos['project'] as List;
const conversation = demos['conversation'] as Conversation;
const PAIRS = KINDS.flatMap((kind) => Object.entries(demos)
  .filter(([, answer]) => (answer.about === 'conversation') === isConversationAnswer(kind)).map(([name, answer]) => ({ kind, name, answer })));
const textOf = (lines: readonly Line[]): string => lines.map((line) => line.map((run) => run.s).join('')).join('\n');
/** As read, not as broken: the sides and the line breaks of a paragraph taken out. */
const read = (lines: readonly Line[]): string => textOf(lines).replace(/[│\n]/g, ' ').replace(/\s+/g, ' ');
const said = (kind: Kind, answer: Answer, columns = 100, lang: Payload['lang'] = 'pl'): string => read(cardLines({ kind, lang, answer }, columns));
const sent = (payload: object): unknown => [{ type: 'text', text: 'words', _meta: { [META]: payload } }];

test('no line is wider than the card, whatever is asked, at every width and in every language', () => {
  for (const { kind, name, answer } of PAIRS) for (const columns of COLUMNS) for (const lang of LANGS) {
    const w = cardWidth(columns);
    const lines = cardLines({ kind, lang, answer }, columns);
    const where = `${kind} ${name} ${columns} ${lang}`;
    assert.ok(w === Math.max(24, columns - 4) && lines.length > 2, where);
    for (const line of lines) assert.equal(widthOf(line), w, `${where}: ${textOf([line])}`);
    if (w >= 60) for (const line of lines) assert.match(textOf([line]), /^[╭│╰].*[╮│╯]$/, where);
    assert.doesNotMatch(textOf(lines), /\u001b|undefined|NaN|\{\w+\}|\[object|\b(?:an|ch|tc|look|st)\.[a-z]/, where);
  }
});

test('no card calls anything safe, and none says who stopped it', () => {
  for (const { kind, answer } of PAIRS) for (const lang of LANGS) {
    assert.doesNotMatch(textOf(cardLines({ kind, lang, answer }, 100)), /\b(safe|clean|secure|bezpieczn\w*|czyst[aeoy]|sicher|sauber)\b/i);
    assert.doesNotMatch(textOf(cardLines({ kind, lang, answer }, 100)), /\b(by a rule|agentwhy stopped|Claude stopped)\b/i);
  }
});

test('TK2: what could not be checked is on every card it belongs to, at every width', () => {
  for (const columns of COLUMNS.filter((one) => one >= 40)) {
    assert.ok(said('okay', project, columns).includes('nie w pełni sprawdzone'), String(columns));
    for (const kind of ['okay', 'conversations', 'attention', 'often'] as const) assert.ok(said(kind, demos['partial'] as Answer, columns).includes('Sprawdzone 12 z 58 rozmów, reszta się czyta.'), `${kind} ${columns}`);
    for (const kind of ['summary', 'steps', 'files', 'helpers', 'todo'] as const) assert.ok(said(kind, demos['long'] as Answer, columns).includes('dwa polecenia otwierały pliki, których nie nazwały'), `${kind} ${columns}`);
  }
});

test('the numbers are the answer\'s own', () => {
  const okay = said('okay', project);
  for (const [n, label] of [[3, 'do naprawy'], [4, 'czytały obserwowane pliki'], [9, 'z zatrzymaniem'], [39, 'nic prywatnego w zapisie'], [3, 'nie w pełni sprawdzone']] as const) assert.match(okay, new RegExp(`${n} \\S ${label}`));
  assert.match(said('often', project, 56), /● 12 przeczytane ■ 5 zatrzymane ○ 6 widziana nazwa/);
  assert.ok(said('often', project, 56).includes('✓ 7 przeczytane'));
  assert.ok(said('stopped', project).includes('jeszcze 7'));
});

test('TK4: the card and the words give one answer: the fact, what to do, where, the range, the rows', () => {
  for (const lang of LANGS) {
    const t = translator(lang);
    for (const answer of Object.values(demos)) {
      if (answer.about === 'conversation') {
        const own = answer as ConversationAnswer;
        assert.ok(said('summary', answer, 200, lang).includes(factOf(own, t)), lang);
        assert.ok(said('summary', answer, 200, lang).includes(askOf(own, t)), lang);
        assert.ok(said('summary', answer, 200, lang).includes(whereOf(own, t)), lang);
      } else {
        const own = answer as unknown as ListAnswer;
        assert.ok(said('okay', answer, 200, lang).includes(whereOf(own, t)), lang);
        assert.ok(said('okay', answer, 200, lang).includes(rangeOf(own, t)), lang);
        if (own.checked.read === 0 || own.beside !== undefined) continue;
        assert.equal(said('okay', answer, 200, lang).includes(t('an.okay.calm')), isCalm(own), lang);
        for (const group of GROUPS) assert.equal(said('okay', answer, 200, lang).includes(t('an.g.' + group)), own.groups[group] > 0, `${lang} ${group}`);
        for (const kind of ['conversations', 'attention', 'tracked', 'stopped'] as const) assert.deepEqual(cardRows(answer, kind), rowsOf(own, kind));
      }
    }
  }
});

test('its words are the repository\'s own, and its few own ones are in every language', () => {
  assert.equal(readFileSync(join(ROOT, 'hooks/terminal/repository-words.ts'), 'utf8'), repositoryWords(), 'run node scripts/terminal-card-words.mjs');
  for (const lang of LANGS) assert.deepEqual(Object.keys(OWN_WORDS[lang]), Object.keys(OWN_WORDS.en), lang);
});

test('it answers what the server answers, and its shape is the server\'s', () => {
  assert.deepEqual([...KINDS].sort(), [...ANSWERS].sort());
  // Held by the compiler: an answer of the server's is an answer of the card's, field by field.
  const conversationShape: (answer: ConversationAnswer) => Conversation = (answer) => answer;
  const listShape: (answer: ListAnswer) => List = (answer) => answer;
  assert.ok(conversationShape !== undefined && listShape !== undefined);
  assert.deepEqual(payloadOf(sent({ about: 'okay', lang: 'de', list: project })), { kind: 'okay', lang: 'de', answer: project });
  assert.deepEqual(payloadOf(sent({ about: 'steps', lang: 'pl', conversation, other: { title: 'Fix payments' } })), { kind: 'steps', lang: 'pl', answer: conversation, other: { title: 'Fix payments' } });
});

test('a shape it does not know is no answer of its', () => {
  const list = project as unknown as Record<string, unknown>;
  const steps = conversation.steps;
  for (const output of [
    undefined, null, 'words', '{"about":"okay"}', [], [null, 7], [{ type: 'text', text: 'words' }], sent({ about: 'okay', lang: 'pl' }),
    sent({ about: 'no-such-kind', list }), sent({ about: 'summary', list }), sent({ about: 'okay', conversation }), sent({ about: 'okay', list: { ...list, groups: {} } }),
    sent({ about: 'okay', list: { ...list, checked: { read: -1, of: 2 } } }), sent({ about: 'conversations', list: { ...list, rows: [{ look: 'read' }] } }), sent({ about: 'often', list: { ...list, often: [{ path: 7 }] } }),
    sent({ about: 'summary', conversation: { ...conversation, numbers: {} } }), sent({ about: 'steps', conversation: { ...conversation, steps: { ...steps, list: [{ tone: 'pink' }] } } }),
    sent({ about: 'steps', conversation, other: { title: 7 } }), sent({ about: 'conversations', list: { ...list, recent: undefined } }),
  ]) assert.equal(payloadOf(output), undefined, JSON.stringify(output)?.slice(0, 80));
});

test('CV7: a card about another conversation names it and never says it is this one', () => {
  const other = (title: string | undefined) => read(cardLines({ kind: 'steps', lang: 'en', answer: conversation, other: title === undefined ? {} : { title } }, 100));
  assert.ok(other('Fix payments').includes('agentwhy · Fix payments') && !other('Fix payments').includes('this conversation'));
  assert.ok(other(undefined).includes('A conversation with no title'));
  assert.ok(other('Fix payments').includes('open the report'));
});

test('a title or a path from a record stays on its line, whatever it holds', () => {
  const nasty = ['\u001b[31mred\u001b[0m\nsecond line', 'a'.repeat(500), '日本語のとても長い会話のタイトルです'.repeat(4), 'zażółć gęślą jaźń'.normalize('NFD').repeat(6), '🔥🚀 launch 👩‍👩‍👧 🇵🇱', '‮evil‬', ''];
  for (const title of nasty) {
    const answer = { ...project, rows: project.rows.map((row) => ({ ...row, title })), often: project.often.map((row) => ({ ...row, path: title })) };
    const file = <T extends object>(one: T) => ({ ...one, path: title, place: 'outside' as const });
    const own = { ...conversation, files: conversation.files.map(file), todo: conversation.todo.map(file), helpers: conversation.helpers.map((helper) => ({ ...helper, asked: title, files: helper.files.map(file) })) };
    for (const columns of COLUMNS) {
      const cards = [...(['conversations', 'often'] as const).map((kind) => cardLines({ kind, lang: 'pl', answer }, columns)),
        ...(['summary', 'files', 'helpers', 'todo'] as const).map((kind) => cardLines({ kind, lang: 'pl', answer: own, other: { title } }, columns))];
      for (const line of cards.flat()) assert.equal(widthOf(line), cardWidth(columns));
        assert.doesNotMatch(cards.flat().flatMap((line) => line.map((run) => run.s)).join(''), /[\u0000-\u001f‪-‮]/);
    }
  }
  assert.equal(clean('zażółć'.normalize('NFD')), 'zażółć');
});

test('the module draws and does nothing else: one event, one noun of the engine\'s', () => {
  const source = readFileSync(join(ROOT, 'hooks/terminal/register.tsx'), 'utf8');
  assert.deepEqual([...source.matchAll(/\bon\('([^']+)'/g)].map((match) => match[1]), ['ui.render', 'ui.render']);
  assert.deepEqual([...new Set([...source.matchAll(/\$\.([\w.]+)/g)].map((match) => match[1]))], ['ui.resolve']);
  assert.match(source, /'mcp__plugin_agentwhy_agentwhy__what_happened'/);
  for (const file of ['answer', 'words', 'repository-words', 'cells', 'pieces', 'conversation', 'list', 'table', 'card']) {
    assert.doesNotMatch(readFileSync(join(ROOT, `hooks/terminal/${file}.ts`), 'utf8'), /from '(?!\.\/)/, `${file} imports its neighbours alone`);
  }
});

// The review of 2026-11-24.
test('a card is in one language', () => {
  for (const { kind, answer } of PAIRS.filter((pair) => pair.name !== 'long')) {
    assert.doesNotMatch(said(kind, answer, 100, 'pl'), /\b(read|stopped|helpers?|name only|not known|opened|changed|to act on|steps?)\b/i, kind);
  }
  assert.match(said('summary', conversation, 100, 'pl'), /przeczytan\w+ .*pomocnik/);
});

test('TK2: steps say what of the ordinary ones is not known, and lists what could not be checked', () => {
  const steps = { ...conversation, steps: { ...conversation.steps, helperSteps: 30, notKnown: ['W 1 z pozostałych kroków nie widać, które pliki otwarto'] } };
  const text = said('steps', steps);
  assert.ok(text.includes('W 1 z pozostałych kroków nie widać, które pliki otwarto') && text.includes('30 kroków pomocników nie nazwało prywatnego pliku'), text);
  const unsure: List = { ...project, groups: { ...project.groups, attention: 0, tracked: 0, stopped: 0, partly: 2, failed: 2 }, rows: [], recent: 0, rowsMore: 0, often: [], oftenMore: 0, namedOnly: 0 };
  for (const kind of ['conversations', 'attention', 'tracked', 'stopped', 'often'] as const) {
    assert.ok(said(kind, unsure).includes('2 nie w pełni sprawdzone') && said(kind, unsure).includes('2 nie dało się odczytać'), kind);
  }
});

test('CV15: this computer is two cards, each with its own name and count, and one question under them', () => {
  const text = said('okay', demos['both'] as Answer);
  assert.ok(text.indexOf('ten komputer, twoje projekty') < text.indexOf('ten komputer, poza projektami'));
  assert.ok(text.includes('pracowało dla ciebie 58 razy') && text.includes('pracowało dla ciebie 21 razy'));
  assert.equal(text.split('zapytaj:').length, 2);
  assert.equal(payloadOf(sent({ about: 'okay', lang: 'pl', list: { ...project, beside: { about: 'list' } } })), undefined);
});

// The maintainer's run of 2026-11-24: the sessions they had, as a table over the whole terminal, with how many files each met.
test('a list is a table over the whole terminal: each conversation with its day, time, place, look and files', () => {
  for (const lang of LANGS) for (const columns of [100, 140, 190]) {
    const t = translator(lang);
    const lines = cardLines({ kind: 'conversations', lang, answer: project }, columns);
    assert.equal(cardWidth(columns), columns - 4);
    const text = textOf(lines);
    for (const word of ['an.col.title', 'an.col.look', 'an.today', 'an.yesterday']) assert.ok(text.includes(t(word)), `${lang} ${columns} ${word}`);
    assert.ok(text.includes((project.rows[0] as { time: string }).time) && text.includes('Codex'), text);
    const rules = lines.filter((line) => textOf([line]).includes('┼'));
    assert.ok(rules.length >= 2 && rules.every((line) => [...textOf([line])].every((char, at) => char !== '┼' || textOf([rules[0] as Line])[at] === '┼')), 'every rule crosses at the same columns');
  }
  assert.ok(said('conversations', project, 190).includes('58 rozmów'));
});

test('a row says its private files in words, all of them, and where its record is not whole never that there were none', () => {
  const row = project.rows[0] as List['rows'][number];
  const one = (more: object): List => ({ ...project, rows: [{ ...row, ...more }], recent: 1, rowsMore: 0, groups: { ...project.groups, partly: 0 } });
  const files = { read: 2, changed: 1, unknown: 1, opened: 1, stopped: 1, name: 4 };
  for (const columns of [56, 100, 190]) {
    const text = said('conversations', one({ files, all: 41, helpers: 3 }), columns);
    for (const word of ['2 przeczytane', '1 zmieniony', '1 nie wiadomo', '1 otwarty', '1 zatrzymany', '4 tylko nazwa', '41', '3']) assert.ok(text.includes(word), `${columns}: ${word}: ${text}`);
  }
  const nothing = { read: 0, changed: 0, unknown: 0, opened: 0, stopped: 0, name: 0 };
  const last = (more: object): string => cardLines({ kind: 'conversations', lang: 'pl', answer: one({ files: nothing, helpers: 0, ...more }) }, 190).map((line) => textOf([line])).find((line) => line.includes(row.time)) as string;
  assert.match(last({ look: 'unchecked', group: 'partly' }), /│ \? /);
  assert.doesNotMatch(last({ look: 'none', group: 'none' }), /│ \? /);
});

test('an answer from some of the conversations leads with that, and no big number of a few of them stands for all', () => {
  for (const columns of COLUMNS) {
    const text = said('okay', demos['partial'] as Answer, columns);
    assert.doesNotMatch(text, /pracowało dla ciebie/);
    assert.equal(text.split('Sprawdzone 12 z 58 rozmów').length, 2, text);
  }
});

test('one group is said once', () => {
  const one = { ...project, groups: { ...project.groups, attention: 0, tracked: 0, stopped: 0, none: 0, partly: 1 }, checked: { read: 1, of: 1 } };
  assert.equal(said('okay', one).split('nie w pełni sprawdzone').length, 2);
});

test('an AI is called what the page calls it', () => assert.deepEqual(PROVIDERS, PROVIDER_NAMES));

// Seen in the maintainer's terminal, 2026-11-24: a theme's own grey can be as bright as the colours, and a step with nothing private stood out as much as a read.
test('what asks for nothing is drawn lower than what does, in whatever grey the terminal has', () => {
  const runs = cardLines({ kind: 'steps', lang: 'pl', answer: conversation }, 100).flat();
  for (const run of runs) if (run.s.includes('▇')) assert.notEqual(run.c, 'subtle', run.s);
  assert.ok(runs.some((run) => run.s.includes('▂') && run.c === 'subtle'));
});

// The maintainer, 2026-11-24: "tylko sie ucina" - a title is what a conversation is known by.
test('a title is written whole, on as many lines as it needs, and so is the project beside it', () => {
  const computer = demos['computer'] as List;
  for (const columns of COLUMNS.filter((one) => one >= 56)) for (const answer of [project, computer]) for (const kind of ['conversations', 'attention'] as const) {
    const lines = cardLines({ kind, lang: 'pl', answer }, columns).map((line) => textOf([line])).filter((line) => /^[│ \d]/.test(line));
    assert.doesNotMatch(lines.filter((line) => !/jeszcze/.test(line)).join('\n'), /…/, `${kind} ${columns}`);
    const row = project.rows.find((one) => (one.title ?? '').startsWith('Zamówienia')) as { title: string };
    for (const word of row.title.split(' ')) assert.ok(lines.some((line) => line.includes(word)), `${kind} ${columns}: ${word}`);
  }
  assert.ok(said('conversations', computer, 100).includes('strona-firmowa'));
});

test('the summary names the private files where there is nothing to do about them, and says how many steps and files there were', () => {
  for (const columns of [56, 100, 186]) {
    const quiet = said('summary', demos['quiet'] as Answer, columns);
    for (const word of ['.env', 'keys/deploy.pem', '9 kroków', '12 plików']) assert.ok(quiet.includes(word), `${columns} ${word}: ${quiet}`);
    assert.ok(said('summary', conversation, columns).includes('25 kroków') && said('summary', conversation, columns).includes('41 plików'));
  }
});

// The second review of 2026-11-25.
test('a list read again says so and is not calm; an unsure row\'s files are not known, all of them', () => {
  const again = { ...(demos['calm'] as List), reading: true } as List;
  for (const kind of ['okay', 'conversations', 'often'] as const) assert.ok(said(kind, again).includes('czyta część z nich jeszcze raz'), kind);
  assert.ok(!said('okay', again).includes('Nic w nich nie wymaga'));
  const row = { ...(project.rows[0] as List['rows'][number]), look: 'unchecked' as const, group: 'partly' as const, all: 0, helpers: 0, files: { read: 0, changed: 0, unknown: 0, opened: 0, stopped: 0, name: 0 } };
  const line = cardLines({ kind: 'conversations', lang: 'pl', answer: { ...project, rows: [row], recent: 1 } }, 190).map((one) => textOf([one])).find((one) => one.includes(row.time)) as string;
  assert.match(line, /│ \? .*│ +\? │ +– /);
});

test('two files of one name are two lines, and the heading counts both', () => {
  const env = (access: 'read' | 'stopped') => ({ path: '.env', place: 'outside' as const, access });
  const two = { ...conversation, files: [env('read'), env('stopped')], filesMore: 0, todo: [], todoMore: 0, todoKeys: 0 };
  assert.equal(said('summary', two).split('.env (poza projektem)').length - 1, 2);
  const one = { ...two, todo: [{ path: '.env', place: 'outside' as const, kind: 'keys' as const }], todoKeys: 1 };
  assert.ok(said('summary', one).includes('zatrzymany'), 'the second is not hidden by the first');
});

// CVB30: `claude plugin validate --strict` of 2.1.330 refuses a module that names a neighbour with `.ts`.
test('the module names its neighbours with .js, as Claude Code checks them', () => {
  for (const file of ['answer', 'words', 'repository-words', 'cells', 'pieces', 'conversation', 'list', 'table', 'card']) assert.doesNotMatch(readFileSync(join(ROOT, `hooks/terminal/${file}.ts`), 'utf8'), /from '\.[^']*\.ts'/, file);
  assert.doesNotMatch(readFileSync(join(ROOT, 'hooks/terminal/register.tsx'), 'utf8'), /from '\.[^']*\.ts'/);
});

test('a step of several files names them under its sentence', () => {
  const moment = { from: 3, to: 3, tone: 'blue' as const, said: 'Zobaczono nazwy 5 plików.', files: ['.env'], met: ['.env', 'keys/a.pem', '.npmrc', 'src/a.ts'].map((path) => ({ path, access: 'name' as const })), metMore: 1 };
  for (const columns of [56, 100, 186]) {
    const text = said('steps', { ...conversation, steps: { ...conversation.steps, moments: [moment], momentsMore: 0 } }, columns);
    for (const word of ['keys/a.pem', '.npmrc']) assert.ok(text.includes(word), `${columns} ${word}`);
  }
});

test('a helper that met no private file says so, and so does a card where none did', () => {
  const none = { ...conversation, numbers: { ...conversation.numbers, helpers: 2 }, helpers: [1, 2].map((helper) => ({ helper, files: [], filesMore: 0 })), helpersMore: 0 };
  for (const columns of COLUMNS) {
    const text = said('helpers', none, columns, 'en');
    assert.match(text, /In the record no helper met a private file/, String(columns));
  }
  const some = { ...none, helpers: [{ helper: 2, files: [{ path: '.env', access: 'read' as const }], filesMore: 0 }, { helper: 1, files: [], filesMore: 0 }] };
  for (const columns of [56, 120]) {
    assert.match(said('helpers', some, columns, 'en'), /no private file in its record/, String(columns));
    assert.doesNotMatch(said('helpers', some, columns, 'en'), /In the record no helper/);
  }
});
