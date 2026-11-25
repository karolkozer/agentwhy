// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// Made-up answers in the shape of src/report/answers/answer-model.ts: a fictional shop, no file, title or name of anyone's.
import type { AnswerFile, AnswerGroup, AnswerModel, AnswerRow, AnswerStep, ConversationAnswer, ListAnswer, OftenRow } from '../../src/report/answers/answer-model.ts';
import type { FileAccess } from '../../src/report/render/report-page/files.ts';
import type { StepTone } from '../../src/report/render/report-page/step-looks.ts';
import type { Look } from '../../src/report/render/ui/status-look.ts';

const tones: Readonly<Record<string, StepTone>> = { r: 'coral', t: 'sand', u: 'amber', n: 'blue', s: 'mint', o: 'grey' };
const labels: Readonly<Record<string, string>> = { r: 'sb.tag.read', t: 'look.allowed', u: 'sb.tag.unknown', n: 'look.name', s: 'look.stopped', o: 'look.none' };
const list = (letters: string): AnswerStep[] => [...letters].map((each) => ({ tone: tones[each]!, label: labels[each]! }));
const file = (path: string, access: FileAccess, place?: 'outside' | 'elsewhere'): AnswerFile => ({ path, access, ...(place ? { place } : {}) });

export const conversation: ConversationAnswer = {
  about: 'conversation',
  look: 'read',
  numbers: { read: 8, name: 1, stopped: 1, opened: 0, unknown: 0, changed: 0, helpers: 4 },
  steps: {
    n: 25, leftOut: 0, list: list('oonrrrrrrrooosooroooooooo'),
    moments: [
      { from: 3, to: 3, tone: 'blue', label: 'look.name', said: 'Zobaczono tylko nazwę .env.local', files: ['.env.local'] },
      { from: 4, to: 10, tone: 'coral', label: 'sb.tag.read', said: 'Przeczytano 7 prywatnych plików, jeden po drugim: .env.production, config/prod.yml i jeszcze 5', files: ['.env.production', 'config/prod.yml'], first: true },
      { from: 14, to: 14, tone: 'mint', label: 'look.stopped', said: 'Próba przeczytania keys/deploy.pem została zatrzymana', files: ['keys/deploy.pem'] },
      { from: 17, to: 17, tone: 'coral', label: 'sb.tag.read', said: 'Przekazano pracę: Pomocnik 1.', files: [] },
      { from: 5, to: 5, tone: 'coral', label: 'sb.tag.read', said: 'Przeczytano config/stripe.json', files: ['config/stripe.json'], helper: 1 },
    ],
    momentsMore: 0, reads: 8, ordinary: 15, helperSteps: 0,
  },
  files: [
    file('.env.production', 'read'), file('config/prod.yml', 'read'), file('.env', 'read'), file('keys/mail.json', 'read'), file('config/db.yml', 'read'),
    file('data/klienci.csv', 'read'), file('.npmrc', 'read', 'outside'), file('config/stripe.json', 'read'), file('keys/deploy.pem', 'stopped'), file('.env.local', 'name'),
  ],
  filesMore: 0,
  helpers: [
    { helper: 1, asked: 'Sprawdź ustawienia płatności', files: [file('config/stripe.json', 'read')], filesMore: 0 },
    { helper: 2, asked: 'Przygotuj wdrożenie na serwer', files: [file('keys/deploy.pem', 'stopped'), file('.env.local', 'name')], filesMore: 0 },
    { helper: 3, asked: 'Popraw eksport zamówień do arkusza', files: [file('data/klienci.csv', 'read'), file('data/zamowienia.csv', 'unknown')], filesMore: 0 },
  ],
  helpersMore: 0,
  todo: [{ path: '.env.production', kind: 'keys' }, { path: 'config/stripe.json', kind: 'keys' }, { path: 'data/klienci.csv', kind: 'data' }],
  todoMore: 0, todoKeys: 2, all: 41,
};

const day = (d: number, m = 11) => ({ year: 2026, month: m, day: d });
const filesOf = (group: AnswerGroup): AnswerRow['files'] => ({ read: group === 'attention' || group === 'tracked' ? 3 : 0, changed: group === 'attention' ? 1 : 0, unknown: 0, opened: 0, stopped: group === 'stopped' || group === 'attention' ? 2 : 0, name: group === 'none' ? 0 : 1 });
let minute = 0;
const row = (title: string | undefined, look: Look, group: AnswerGroup, d: number, relative?: 'today' | 'yesterday', m?: number, more: Partial<AnswerRow> = {}): AnswerRow => ({ time: `${String(21 - Math.floor((minute += 37) / 60) % 14).padStart(2, '0')}:${String((59 - minute % 60)).padStart(2, '0')}`, held: 'terminal', key: 'c' + d, ref: 'c' + d, report: true, ...(title ? { title } : {}), provider: 'claude-code', day: day(d, m), ...(relative ? { relative } : {}), look, group, read: group === 'attention' ? 3 : 0, files: filesOf(group), all: 4 + (minute % 90), helpers: minute % 4, ...more });
const often = (path: string, read: number, stopped: number, named: number, unknown: number, conversations: number, extra: Partial<OftenRow> = {}): OftenRow => ({ path, wanted: read + stopped + unknown + (extra.changed ?? 0) + (extra.opened ?? 0), read, changed: 0, opened: 0, stopped, named, unknown, tracked: false, conversations, ...extra });

export const project: ListAnswer = {
  about: 'list', scope: 'project', asked: '30d',
  checked: { read: 58, of: 58 },
  groups: { attention: 3, fixed: 0, tracked: 4, stopped: 9, seen: 0, none: 39, partly: 3, failed: 0 },
  rows: [
    row('Naprawa płatności w sklepie', 'read', 'attention', 24, 'today'),
    row('Cennik na nowy sezon', 'allowed', 'tracked', 24, 'today'),
    row('Nowa strona główna', 'none', 'none', 23, 'yesterday', undefined, { held: 'desktop' }),
    row('Wdrożenie na serwer', 'stopped', 'stopped', 23, 'yesterday', undefined, { provider: 'codex', held: 'desktop' }),
    row('Zamówienia z pliku od hurtowni, które nie chcą się zaimportować do sklepu', 'read', 'attention', 21),
    row('Logo i kolory', 'none', 'none', 20, undefined, undefined, { held: 'editor' }),
    row('Wysyłka maili do klientów', 'unchecked', 'partly', 19),
    row('Sprzątanie starych plików', 'stopped', 'stopped', 18),
    row('Notatki do oferty', 'allowed', 'tracked', 14),
    row(undefined, 'none', 'none', 9),
    row('Formularz kontaktowy', 'read', 'attention', 30, undefined, 10),
    row('Pierwsza wersja koszyka', 'none', 'none', 28, undefined, 10),
  ],
  recent: 12, rowsMore: 46,
  often: [
    often('.env.production', 12, 5, 6, 0, 4),
    often('keys/deploy.pem', 0, 9, 3, 0, 6),
    often('notatki/cennik.md', 7, 0, 0, 0, 3, { tracked: true }),
    often('config/stripe.json', 4, 0, 1, 1, 2),
    often('data/klienci.csv', 3, 0, 0, 0, 1),
  ],
  oftenMore: 0,
  namedOnly: 32,
};

export const partial: ListAnswer = { ...project, reading: true, checked: { read: 12, of: 58 }, groups: { attention: 1, fixed: 0, tracked: 1, stopped: 2, seen: 1, none: 6, partly: 1, failed: 0 } };
export const calm: ListAnswer = { ...project, checked: { read: 21, of: 21 }, groups: { attention: 0, fixed: 1, tracked: 2, stopped: 4, seen: 2, none: 12, partly: 0, failed: 0 }, rows: project.rows.filter((one) => one.group !== 'attention' && one.group !== 'partly'), rowsMore: 9 };
export const empty: ListAnswer = { ...project, checked: { read: 0, of: 0 }, groups: { attention: 0, fixed: 0, tracked: 0, stopped: 0, seen: 0, none: 0, partly: 0, failed: 0 }, rows: [], rowsMore: 0, often: [], namedOnly: 0 };
export const reading: ListAnswer = { ...empty, checked: { read: 0, of: 58 } };
export const computer: ListAnswer = { ...project, scope: 'computer', list: 'projects', rows: project.rows.map((one, at) => ({ ...one, project: ['sklep-z-herbata', 'strona-firmowa', 'aplikacja-treningowa'][at % 3]! })), often: project.often.map((one, at) => ({ ...one, project: ['sklep-z-herbata', 'strona-firmowa'][at % 2]! })) };

/** Two hundred and forty steps, and a record with a gap. */
export const long: ConversationAnswer = {
  ...conversation, look: 'read',
  steps: { ...conversation.steps, n: 240, leftOut: 258, list: list(Array.from({ length: 240 }, (_, i) => (i > 30 && i < 38 ? 'r' : i === 90 ? 's' : i === 91 ? 's' : i > 140 && i < 144 ? 't' : i === 200 ? 'u' : 'o')).join('')), reads: 7, ordinary: 227, helperSteps: 0, momentsMore: 3 },
  notChecked: ['dwa polecenia otwierały pliki, których nie nazwały', 'koniec jednego polecenia nie jest zapisany'],
  files: [...conversation.files, file('bardzo/dlugi/folder/z/ustawieniami/serwera/produkcyjnego/klucze-do-platnosci-online.json', 'unknown'), file('raport.xlsx', 'changed', 'outside'), file('kopia.sql', 'opened')],
  filesMore: 7,
  numbers: { read: 8, name: 1, stopped: 1, opened: 1, unknown: 1, changed: 1, helpers: 7 },
  helpers: [...conversation.helpers, { helper: 4, asked: 'Przejrzyj kopie zapasowe', files: [file('kopia.sql', 'opened')], filesMore: 2 }, { helper: 6, files: [file('raport.xlsx', 'changed', 'outside')], filesMore: 0 }],
  helpersMore: 1, todoMore: 4,
};
/** Nothing asked of the person. */
export const quiet: ConversationAnswer = { about: 'conversation', look: 'stopped', numbers: { read: 0, name: 0, stopped: 2, opened: 0, unknown: 0, changed: 0, helpers: 0 }, steps: { n: 9, leftOut: 0, list: list('oosoooso' + 'o'), moments: [{ from: 3, to: 3, tone: 'mint', label: 'look.stopped', said: 'Próba przeczytania .env została zatrzymana', files: ['.env'] }, { from: 7, to: 7, tone: 'mint', label: 'look.stopped', said: 'Próba przeczytania keys/deploy.pem została zatrzymana', files: [] }], momentsMore: 0, reads: 7, ordinary: 7, helperSteps: 0 }, files: [file('.env', 'stopped'), file('keys/deploy.pem', 'stopped')], filesMore: 0, helpers: [], helpersMore: 0, todo: [], todoMore: 0, todoKeys: 0, all: 12 };

/** Every group at once, and numbers nobody's month holds. */
export const every: ListAnswer = { ...project, scope: 'computer', list: 'outside', asked: '2026-10-01', checked: { read: 123456, of: 123999 }, groups: { attention: 12345, fixed: 2, tracked: 31, stopped: 4096, seen: 7, none: 100000, partly: 250, failed: 1 }, oftenMore: 41, often: [often('a/very/long/path/to/some/settings/file-with-a-very-long-name.production.json', 40960, 2, 99999, 3, 1200, { changed: 4, opened: 5 }), often('.npmrc', 1, 0, 0, 0, 1, { place: 'outside' })] };
/** One step, one file, one helper. */
export const tiny: ConversationAnswer = { ...conversation, numbers: { read: 1, name: 0, stopped: 0, opened: 0, unknown: 0, changed: 0, helpers: 1 }, steps: { n: 1, leftOut: 0, list: list('r'), moments: [{ from: 1, to: 1, tone: 'coral', label: 'sb.tag.read', said: 'Przeczytano .env', files: ['.env'] }], momentsMore: 0, reads: 1, ordinary: 0, helperSteps: 0 }, files: [file('.env', 'read')], helpers: [{ helper: 1, files: [file('.env', 'read', 'outside')], filesMore: 0 }], todo: [{ path: '.env', kind: 'keys' }] };
/** A record with nothing in it. */
export const nothing: ConversationAnswer = { about: 'conversation', look: 'unchecked', numbers: { read: 0, name: 0, stopped: 0, opened: 0, unknown: 0, changed: 0, helpers: 0 }, steps: { n: 0, leftOut: 0, list: [], moments: [], momentsMore: 0, reads: 1, ordinary: 0, helperSteps: 0 }, files: [], filesMore: 0, helpers: [], helpersMore: 0, todo: [], todoMore: 0, todoKeys: 0, all: 0, notChecked: ['zapis urywa się w połowie'] };

/** This computer: its two lists. */
export const both: ListAnswer = { ...computer, beside: { ...calm, scope: 'computer', list: 'outside' } };

export const DEMOS: Readonly<Record<string, AnswerModel>> = { both, every, tiny, nothing, conversation, project, partial, calm, empty, reading, computer, long, quiet };
