// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { NoticeLang } from '../../report/watch/notice-choices.ts';

/**
 * What the person reads during the turn (`2026-11-05-a-key-in-what-it-read.md` KR6, KR7), in the glossary's words (design
 * guidelines §7: *your AI*, *key*, *change the key*). The AI's own words are `keySwapNotice`, the wording measured.
 */
const PLURAL_PL = (n: number): string => {
  if (n === 1) return 'klucz';
  const tens = n % 100;
  const ones = n % 10;
  return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? 'klucze' : 'kluczy';
};

/** A key swapped: the AI did not read it, and it is still where it was. */
export function keysHiddenLine(count: number, lang: NoticeLang): string {
  if (lang === 'pl') return `agentwhy ukrył przed twoim AI ${count} ${PLURAL_PL(count)} w tym wyniku. Prawdziwa wartość została tam, gdzie była.`;
  if (lang === 'de') {
    return `agentwhy hat in diesem Ergebnis ${count} Schlüssel vor deiner KI verborgen. Der echte Wert bleibt, wo er war.`;
  }
  return `agentwhy hid ${count} ${count === 1 ? 'key' : 'keys'} from your AI in this result. The real value stays where it was.`;
}

/** A result in a shape not measured: the key was seen, and nothing is claimed for it. */
export function keyNotHiddenLine(lang: NoticeLang): string {
  if (lang === 'pl') return 'Wynik narzędzia zawierał klucz, którego agentwhy nie umiał ukryć, więc twoje AI go przeczytało. Jeśli to prawdziwy klucz, zmień go.';
  if (lang === 'de') return 'Das Ergebnis eines Werkzeugs enthielt einen Schlüssel, den agentwhy nicht verbergen konnte, deine KI hat ihn also gelesen. Falls er echt ist, ändere ihn.';
  return 'A tool\'s result held a key agentwhy could not hide, so your AI read it. If the key is real, change it.';
}

/** KR7: a failed call cannot be swapped, so this says what happened and claims nothing. */
export function keyInFailureLine(lang: NoticeLang): string {
  if (lang === 'pl') {
    return 'Polecenie się nie powiodło, a to, co wypisało, zawierało klucz. agentwhy nie może ukryć wyniku nieudanego polecenia, więc twoje AI go przeczytało. Jeśli to prawdziwy klucz, zmień go.';
  }
  if (lang === 'de') {
    return 'Ein Befehl ist fehlgeschlagen, und seine Ausgabe enthielt einen Schlüssel. Die Ausgabe eines fehlgeschlagenen Befehls kann agentwhy nicht verbergen, deine KI hat ihn also gelesen. Falls er echt ist, ändere den Schlüssel.';
  }
  return 'A command failed, and what it printed held a key. agentwhy cannot hide the output of a failed command, so your AI read it. If the key is real, change it.';
}
