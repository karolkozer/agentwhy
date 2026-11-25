// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { KEY_PLACEHOLDER, PLACEHOLDER_WRITE_OPENS } from '../../core/redaction/swap-keys.ts';
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

/**
 * `2026-11-23-a-write-over-the-key.md` WK3: what the AI reads when a write that would put the placeholder over a key is refused.
 * It names the file as the AI wrote it, as `refuse` names a path (R19) - never the key, its format or where it is - and offers
 * no way around (KR5): the file changed around that line, or the value asked of the person. The opening stays English in
 * every language, as `refuse`'s does, so a report finds it (WK7). A `Write`'s words are the ones measured (WKB2); an `Edit` adds the
 * placeholder rather than replacing the file, so it is said as that, with the same way on.
 */
export function placeholderWriteRefusal(file: string, lang: NoticeLang, kind: 'write' | 'edit' = 'write'): string {
  if (kind === 'edit') return placeholderEditRefusal(file, lang);
  if (lang === 'pl') {
    return `${PLACEHOLDER_WRITE_OPENS}${file} zawiera prawdziwy klucz, którego ci nie pokazano, a ten zapis zastąpiłby go tekstem ${KEY_PLACEHOLDER}. ` +
      'Zmień plik wokół tej linii albo poproś osobę, z którą pracujesz, o tę wartość.';
  }
  if (lang === 'de') {
    return `${PLACEHOLDER_WRITE_OPENS}${file} enthält einen echten Schlüssel, der dir nicht gezeigt wurde, und dieser Schreibvorgang würde ihn durch ${KEY_PLACEHOLDER} ersetzen. ` +
      'Ändere die Datei rund um diese Zeile oder bitte die Person, mit der du arbeitest, um den Wert.';
  }
  return `${PLACEHOLDER_WRITE_OPENS}${file} holds a real key you were not shown, and this write would replace it with ${KEY_PLACEHOLDER}. ` +
    'Change the file around that line, or ask the person for the value.';
}

function placeholderEditRefusal(file: string, lang: NoticeLang): string {
  if (lang === 'pl') {
    return `${PLACEHOLDER_WRITE_OPENS}ta edycja wstawiłaby tekst ${KEY_PLACEHOLDER} do pliku ${file}, który zawiera prawdziwy klucz, którego ci nie pokazano. ` +
      'Zmień plik wokół tej linii albo poproś osobę, z którą pracujesz, o tę wartość.';
  }
  if (lang === 'de') {
    return `${PLACEHOLDER_WRITE_OPENS}diese Bearbeitung würde ${KEY_PLACEHOLDER} in die Datei ${file} einfügen, die einen echten Schlüssel enthält, der dir nicht gezeigt wurde. ` +
      'Ändere die Datei rund um diese Zeile oder bitte die Person, mit der du arbeitest, um den Wert.';
  }
  return `${PLACEHOLDER_WRITE_OPENS}this edit would put ${KEY_PLACEHOLDER} into ${file}, which holds a real key you were not shown. ` +
    'Change the file around that line, or ask the person for the value.';
}
