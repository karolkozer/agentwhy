// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Lang } from './answer.js';
import { REPOSITORY_WORDS, type Table } from './repository-words.js';

/** The card's own few words: what can be asked next, and the months, which a module has no other way to write. */
export const OWN_WORDS: Readonly<Record<Lang, Table>> = {
  en: {
    'tc.ask': 'ask: “{q}”',
    'tc.quote': '“{q}”',
    'tc.more': 'ask: “tell me more about {title}”',
    'tc.q.steps': 'what were the steps?',
    'tc.q.files': 'which files did it read?',
    'tc.q.todo': 'what should I do?',
    'tc.q.report': 'open the report',
    'tc.q.okay': 'is everything okay?',
    'tc.q.conversations': 'show my conversations',
    'tc.q.attention': 'which ones?',
    'tc.q.tracked': 'which read files I track?',
    'tc.q.stopped': 'what was stopped?',
    'tc.earlier': 'earlier',
    'tc.month.1': 'Jan',
    'tc.month.2': 'Feb',
    'tc.month.3': 'Mar',
    'tc.month.4': 'Apr',
    'tc.month.5': 'May',
    'tc.month.6': 'Jun',
    'tc.month.7': 'Jul',
    'tc.month.8': 'Aug',
    'tc.month.9': 'Sep',
    'tc.month.10': 'Oct',
    'tc.month.11': 'Nov',
    'tc.month.12': 'Dec',
  },
  pl: {
    'tc.ask': 'zapytaj: „{q}”',
    'tc.quote': '„{q}”',
    'tc.more': 'powiedz więcej o „{title}”',
    'tc.q.steps': 'jakie były kroki?',
    'tc.q.files': 'które pliki przeczytało?',
    'tc.q.todo': 'co mam zrobić?',
    'tc.q.report': 'otwórz raport',
    'tc.q.okay': 'czy wszystko okej?',
    'tc.q.conversations': 'pokaż moje rozmowy',
    'tc.q.attention': 'które to rozmowy?',
    'tc.q.tracked': 'które czytały obserwowane pliki?',
    'tc.q.stopped': 'co zostało zatrzymane?',
    'tc.earlier': 'wcześniej',
    'tc.month.1': 'sty',
    'tc.month.2': 'lut',
    'tc.month.3': 'mar',
    'tc.month.4': 'kwi',
    'tc.month.5': 'maj',
    'tc.month.6': 'cze',
    'tc.month.7': 'lip',
    'tc.month.8': 'sie',
    'tc.month.9': 'wrz',
    'tc.month.10': 'paź',
    'tc.month.11': 'lis',
    'tc.month.12': 'gru',
  },
  de: {
    'tc.ask': 'frag: „{q}“',
    'tc.quote': '„{q}“',
    'tc.more': 'erzähl mehr über „{title}“',
    'tc.q.steps': 'was waren die Schritte?',
    'tc.q.files': 'welche Dateien hat sie gelesen?',
    'tc.q.todo': 'was soll ich tun?',
    'tc.q.report': 'öffne den Bericht',
    'tc.q.okay': 'ist alles okay?',
    'tc.q.conversations': 'zeig meine Gespräche',
    'tc.q.attention': 'welche sind das?',
    'tc.q.tracked': 'welche haben beobachtete Dateien gelesen?',
    'tc.q.stopped': 'was wurde gestoppt?',
    'tc.earlier': 'früher',
    'tc.month.1': 'Jan',
    'tc.month.2': 'Feb',
    'tc.month.3': 'März',
    'tc.month.4': 'Apr',
    'tc.month.5': 'Mai',
    'tc.month.6': 'Juni',
    'tc.month.7': 'Juli',
    'tc.month.8': 'Aug',
    'tc.month.9': 'Sep',
    'tc.month.10': 'Okt',
    'tc.month.11': 'Nov',
    'tc.month.12': 'Dez',
  },
};

const TABLES: Readonly<Record<Lang, Table>> = {
  en: { ...REPOSITORY_WORDS.en, ...OWN_WORDS.en },
  pl: { ...REPOSITORY_WORDS.pl, ...OWN_WORDS.pl },
  de: { ...REPOSITORY_WORDS.de, ...OWN_WORDS.de },
};

type Vars = Readonly<Record<string, string | number>>;
export type Translate = (key: string, vars?: Vars) => string;

function category(lang: Lang, n: number): string {
  if (n === 1) return 'one';
  if (lang !== 'pl') return 'other';
  const last = n % 10;
  const two = n % 100;
  return last >= 2 && last <= 4 && !(two >= 12 && two <= 14) ? 'few' : 'many';
}

export function translator(lang: Lang): Translate {
  return (key, vars = {}) => {
    const n = typeof vars['n'] === 'number' ? vars['n'] : undefined;
    const said = (n === undefined ? undefined : TABLES[lang][`${key}.${category(lang, n)}`]) ?? TABLES[lang][key] ?? (n === undefined ? undefined : TABLES.en[`${key}.${category('en', n)}`]) ?? TABLES.en[key] ?? key;
    return said.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
  };
}
