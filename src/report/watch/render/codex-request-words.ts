// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { NoticeLang } from '../notice-choices.ts';
import type { AgentRequests } from './instruction-words.ts';

/*
 * The stopped limit says "now": told to never read the file another way, the agent refused to try again later in the
 * same conversation after the person had switched the file to Track (seen by the maintainer, 2026-10-02). The hook is
 * the gate, not the agent's memory of this sentence.
 */
/**
 * What Codex's agent is handed (`2026-10-02-codex-says-it-too.md` CX2, CX3, amended 2026-10-02). Codex shows it whole, in
 * a bubble above the reply (CXB1, CKB14), and the maintainer found the first wording - written to the agent, with the
 * report's command in it - too long and not understandable for the person who reads it first. So each is written to the
 * person: what happened and what to do, in one or two sentences of the glossary's words, in the language chosen for
 * agentwhy; then, in brackets and marked as the AI's ("For the AI:", chosen by the maintainer so a person does not read it
 * as said to them), the one thing the agent is asked - one short sentence back - with the limit that keeps
 * the file safe: never show a key, never read a stopped file another way. No command, no report offered: the report is
 * one step away in Conversations, and a command in that bubble is a line a person cannot read.
 */
export const CODEX_REQUESTS: AgentRequests & { stopped(paths: readonly string[], lang: NoticeLang): string } = {
  stopped: (paths, lang) => STOPPED[lang](listed(paths, lang), paths.length === 1),
  keys: (files, _command, lang) => KEYS[lang](listed(files.map(String), lang), files.length <= 1),
  template: (files, _command, lang) => TEMPLATE[lang](listed(files.map(String), lang), files.length <= 1),
  data: (files, _command, lang) => DATA[lang](listed(files.map(String), lang), files.length <= 1),
  told: (files, _command, lang, foldsTurn) => TOLD[lang](listed(files.map(String), lang), files.length <= 1, foldsTurn === true),
  quiet: (lang, foldsTurn) => QUIET[lang](foldsTurn === true),
  named: (files, _command, lang, foldsTurn) => NAMED[lang](listed(files.map(String), lang), files.length <= 1, foldsTurn === true),
  opened: (files, _command, lang, foldsTurn) => OPENED[lang](listed(files.map(String), lang), files.length <= 1, foldsTurn === true),
};

type Words = (files: string, one: boolean) => string;

const STOPPED: Readonly<Record<NoticeLang, Words>> = {
  en: (files, one) => `**agentwhy** stopped your AI from reading the private ${one ? 'file' : 'files'} ${files}. ` +
    `(For the AI: reply in one short sentence, and don't try to read ${one ? 'it' : 'them'} another way now.)`,
  pl: (files, one) => `**agentwhy** nie pozwolił AI odczytać ${one ? 'prywatnego pliku' : 'prywatnych plików'} ${files}. ` +
    `(Dla AI: odpowiedz jednym krótkim zdaniem i nie próbuj teraz odczytać ${one ? 'go' : 'ich'} inaczej.)`,
  de: (files, one) => `**agentwhy** hat deine KI daran gehindert, ${one ? 'die private Datei' : 'die privaten Dateien'} ${files} zu lesen. ` +
    `(Für die KI: antworte in einem kurzen Satz und versuch jetzt nicht, sie anders zu lesen.)`,
};

const KEYS: Readonly<Record<NoticeLang, Words>> = {
  en: (files, one) => `**agentwhy**: a key from the private ${one ? 'file' : 'files'} ${files} is now in this chat. Make a new key ` +
    `today where it was created; deleting the chat won't undo it. (For the AI: reply in one short sentence; don't show the key.)`,
  pl: (files, one) => `**agentwhy**: klucz z ${one ? 'prywatnego pliku' : 'prywatnych plików'} ${files} jest teraz w tej rozmowie. ` +
    `Zrób dziś nowy klucz tam, gdzie go utworzono; usunięcie rozmowy tego nie cofnie. (Dla AI: odpowiedz jednym krótkim ` +
    `zdaniem; nie pokazuj klucza.)`,
  de: (files, one) => `**agentwhy**: Ein Schlüssel aus ${one ? 'der privaten Datei' : 'den privaten Dateien'} ${files} ist jetzt ` +
    `in diesem Chat. Erstelle heute dort einen neuen, wo er erstellt wurde; den Chat zu löschen hilft nicht. (Für die KI: ` +
    `antworte in einem kurzen Satz; zeig den Schlüssel nicht.)`,
};

/** A template's value may be a placeholder: only a real key is to be made new (S6, `template`). */
const TEMPLATE: Readonly<Record<NoticeLang, Words>> = {
  en: (files, one) => `**agentwhy**: a value from the template ${one ? 'file' : 'files'} ${files} is now in this chat. If it's a ` +
    `real key, make a new one where it was created. (For the AI: reply in one short sentence; don't show the value.)`,
  pl: (files, one) => `**agentwhy**: wartość z ${one ? 'pliku-szablonu' : 'plików-szablonów'} ${files} jest teraz w tej rozmowie. ` +
    `Jeśli to prawdziwy klucz, zrób nowy tam, gdzie go utworzono. (Dla AI: odpowiedz jednym krótkim zdaniem; ` +
    `nie pokazuj tej wartości.)`,
  de: (files, one) => `**agentwhy**: Ein Wert aus ${one ? 'der Vorlagendatei' : 'den Vorlagendateien'} ${files} ist jetzt in ` +
    `diesem Chat. Ist es ein echter Schlüssel, erstelle dort einen neuen, wo er erstellt wurde. (Für die KI: antworte in ` +
    `einem kurzen Satz; zeig den Wert nicht.)`,
};

/** Data cannot be made new, so nothing is asked to be changed (S6, `data`): what cannot be taken back, and where to look. */
const DATA: Readonly<Record<NoticeLang, Words>> = {
  en: (files, one) => `**agentwhy**: private data from the private ${one ? 'file' : 'files'} ${files} is now in this chat. It ` +
    `can't be taken back; agentwhy's report shows how to limit the damage. (For the AI: reply in one short sentence; don't repeat the data.)`,
  pl: (files, one) => `**agentwhy**: prywatne dane z ${one ? 'prywatnego pliku' : 'prywatnych plików'} ${files} są teraz w tej ` +
    `rozmowie. Nie da się tego cofnąć; raport agentwhy pokazuje, jak ograniczyć szkody. (Dla AI: odpowiedz jednym krótkim ` +
    `zdaniem; nie powtarzaj tych danych.)`,
  de: (files, one) => `**agentwhy**: Private Daten aus ${one ? 'der privaten Datei' : 'den privaten Dateien'} ${files} sind jetzt ` +
    `in diesem Chat. Das lässt sich nicht zurücknehmen; der Bericht von agentwhy zeigt, wie du den Schaden begrenzt. (Für ` +
    `die KI: antworte in einem kurzen Satz; wiederhole die Daten nicht.)`,
};

/**
 * Where the app folds the turn away (`foldsTurn`, the desktop app, CXB5's display note), told and quiet ask the
 * answer back - decided by the maintainer, 2026-10-02, after a control run: with a block, the whole Apache-licence
 * answer sat behind "Worked for ...", and the visible reply was one line about private files. The full answer, not a
brief one: the maintainer tried "repeat your answer" the same day and found the visible repeat more condensed than
the original the fold hides. A told file is one the
 * person lets their AI read, so the repeat carries nothing that may not be here; keys, data and a stopped command
 * keep their limits - what their fold hides is what must not be repeated. VS Code's Codex folds nothing, so there
 * the one short sentence stays and nothing is said twice.
 */
const TOLD: Readonly<Record<NoticeLang, (files: string, one: boolean, folds: boolean) => string>> = {
  en: (files, one, folds) => `**agentwhy**: your AI read the private ${one ? 'file' : 'files'} ${files}, which you let it read. ` +
    `Nothing to do. (For the AI: ${folds ? 'repeat your full answer for the user, then that nothing needs doing' : 'reply in one short sentence'}.)`,
  pl: (files, one, folds) => `**agentwhy**: AI przeczytało ${one ? 'prywatny plik' : 'prywatne pliki'} ${files}, na ${one ? 'który' : 'które'} ` +
    `pozwoliłeś. Nic nie trzeba robić. (Dla AI: ${folds ? 'powtórz całą swoją odpowiedź dla użytkownika i dodaj, że nic nie trzeba robić' : 'odpowiedz jednym krótkim zdaniem'}.)`,
  de: (files, one, folds) => `**agentwhy**: Deine KI hat ${one ? 'die private Datei' : 'die privaten Dateien'} ${files} gelesen, die du ` +
    `ihr erlaubt hast. Nichts zu tun. (Für die KI: ${folds ? 'wiederhole deine ganze Antwort für den Nutzer und ergänze, dass nichts zu tun ist' : 'antworte in einem kurzen Satz'}.)`,
};

/**
 * CX10: a reach the person asked to hear of, in an app that shows no line (the desktop app, CXB4; the VS Code panel,
 * CXB7). Said as what the record holds and no more (R12b): the file's name in the Conversations page's own words
 * ("Its record names 1 private file"), or a read with no key and no private data traced from it. Nothing is asked to be
 * changed; the report shows what was recorded. The limit is the stopped request's: not opened again now.
 */
const NAMED: Readonly<Record<NoticeLang, (files: string, one: boolean, folds: boolean) => string>> = {
  en: (files, one, folds) => `**agentwhy**: your AI's record names the private ${one ? 'file' : 'files'} ${files}. It doesn't show whether ` +
    `the AI read what is inside; agentwhy's report shows what was recorded. (For the AI: ${folds ? 'repeat your full answer for the user, then this in one sentence' : 'reply in one short sentence'}; ` +
    `don't open ${one ? 'it' : 'them'} again now.)`,
  pl: (files, one, folds) => `**agentwhy**: w zapisie AI jest nazwa ${one ? 'prywatnego pliku' : 'prywatnych plików'} ${files}. Zapis nie pokazuje, ` +
    `czy AI odczytało ${one ? 'jego' : 'ich'} treść; raport agentwhy pokazuje, co zapisano. (Dla AI: ${folds ? 'powtórz całą swoją odpowiedź dla użytkownika i dodaj to jednym zdaniem' : 'odpowiedz jednym krótkim zdaniem'}; ` +
    `nie otwieraj ${one ? 'go' : 'ich'} teraz ponownie.)`,
  de: (files, one, folds) => `**agentwhy**: Im Protokoll deiner KI steht der Name ${one ? 'der privaten Datei' : 'der privaten Dateien'} ${files}. Es zeigt ` +
    `nicht, ob die KI den Inhalt gelesen hat; der Bericht von agentwhy zeigt, was aufgezeichnet wurde. (Für die KI: ${folds ? 'wiederhole deine ganze Antwort für den Nutzer und ergänze dies in einem Satz' : 'antworte in einem kurzen Satz'}; ` +
    'öffne sie jetzt nicht erneut.)',
};

const OPENED: Readonly<Record<NoticeLang, (files: string, one: boolean, folds: boolean) => string>> = {
  en: (files, one, folds) => `**agentwhy**: your AI read the private ${one ? 'file' : 'files'} ${files}. No key and no private data from ` +
    `${one ? 'it' : 'them'} was found in this chat; agentwhy's report shows what was read. (For the AI: ${folds ? 'repeat your full answer for the user, then this in one sentence' : 'reply in one short sentence'}; ` +
    `don't open ${one ? 'it' : 'them'} again now.)`,
  pl: (files, one, folds) => `**agentwhy**: AI przeczytało ${one ? 'prywatny plik' : 'prywatne pliki'} ${files}. W tej rozmowie nie znaleziono ` +
    `z ${one ? 'niego' : 'nich'} klucza ani prywatnych danych; raport agentwhy pokazuje, co odczytano. (Dla AI: ${folds ? 'powtórz całą swoją odpowiedź dla użytkownika i dodaj to jednym zdaniem' : 'odpowiedz jednym krótkim zdaniem'}; ` +
    `nie otwieraj ${one ? 'go' : 'ich'} teraz ponownie.)`,
  de: (files, one, folds) => `**agentwhy**: Deine KI hat ${one ? 'die private Datei' : 'die privaten Dateien'} ${files} gelesen. Kein Schlüssel und keine ` +
    `privaten Daten daraus wurden in diesem Chat gefunden; der Bericht von agentwhy zeigt, was gelesen wurde. (Für die KI: ${folds ? 'wiederhole deine ganze Antwort für den Nutzer und ergänze dies in einem Satz' : 'antworte in einem kurzen Satz'}; ` +
    'öffne sie jetzt nicht erneut.)',
};

const QUIET: Readonly<Record<NoticeLang, (folds: boolean) => string>> = {
  en: (folds) => '**agentwhy** is keeping watch over your private files: none has been opened so far. ' +
    `(For the AI: ${folds ? 'repeat your full answer for the user, then this in one sentence' : 'reply in one short sentence'}.)`,
  pl: (folds) => '**agentwhy** pilnuje twoich prywatnych plików: jak dotąd żaden nie został otwarty. ' +
    `(Dla AI: ${folds ? 'powtórz całą swoją odpowiedź dla użytkownika i dodaj to jednym zdaniem' : 'odpowiedz jednym krótkim zdaniem'}.)`,
  de: (folds) => '**agentwhy** passt auf deine privaten Dateien auf: Bisher wurde keine geöffnet. ' +
    `(Für die KI: ${folds ? 'wiederhole deine ganze Antwort für den Nutzer und ergänze dies in einem Satz' : 'antworte in einem kurzen Satz'}.)`,
};

/** At most three files by name, then how many more: a request a person reads is not a list. */
function listed(paths: readonly string[], lang: NoticeLang): string {
  const named = [...new Set(paths)].slice(0, 3);
  const rest = new Set(paths).size - named.length;
  const and = AND[lang];
  if (rest > 0) named.push(MORE[lang](rest));
  if (named.length <= 1) return named[0] ?? '';
  return `${named.slice(0, -1).join(', ')} ${and} ${named.at(-1) as string}`;
}

const AND: Readonly<Record<NoticeLang, string>> = { en: 'and', pl: 'i', de: 'und' };
const MORE: Readonly<Record<NoticeLang, (count: number) => string>> = {
  en: (count) => `${count} more`,
  pl: (count) => `${count} innych`,
  de: (count) => `${count} weitere`,
};

/** Codex's set: Claude Code's three, and the one its hook alone says (CX2). */
export type CodexRequests = typeof CODEX_REQUESTS;
