// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { RememberedAlert, SessionCounts } from '../../../ports/alert-store.ts';
import type { Renderer } from '../../../shared/renderer.ts';
import type { AgentAlert } from '../agent-alert.ts';
import type { NoticeLang } from '../notice-choices.ts';
import type { NotChecked, ReadKind, WatchNotice } from '../watch-notice.ts';

/** The title every notice carries, wherever it is shown. */
export const NOTICE_TITLE = 'agentwhy';

/** Said the same way wherever details are offered, and last, where a cut notice loses it first. */
const DETAILS = 'Details: agentwhy report --open';

/**
 * What to do, first, in the words `check` already uses for the same two cases. A notice arrives in a frame this
 * project does not draw - grey italics under a reply, or three lines of a system notification - so the first thing
 * read has to be the action, not the account (`a-notice-in-the-conversation.md` R4).
 */
const ROTATE = 'ROTATE:';
const CHECK = 'CHECK:';
/** The third word, for the level that asks for nothing: a rule held, and the reader is being told so (R1, R3). */
const NOTE = 'NOTE:';

/**
 * About what a macOS notification shows before it cuts the words (B4f, the user's screenshot: three lines of about
 * 50 characters under the title). Every notice is written to fit it, so that what happened and where to look are
 * both read; `tests/report/watch/render/notice-words.test.ts` holds each one to it.
 */
export const NOTICE_BUDGET = 150;

/** How a refusal by a rule is said, in one agent's notice and in the line that counts several. */
const RULE_REFUSED = 'a rule refused';

/**
 * Who is speaking, for the one channel with no title of its own. A terminal notification and a system notification
 * are drawn with `NOTICE_TITLE` above them; the line in the conversation arrives under a frame Claude Code writes
 * (`Stop says: …`), which names the event and not the tool - so the words say it instead. The budget in
 * `NOTICE_BUDGET` is what a notification shows, and this is not one, so it is measured without this prefix.
 */
export function withTitle(words: string): string {
  return words === '' ? '' : `${NOTICE_TITLE} · ${words}`;
}

const NOT_CHECKED: Readonly<Record<NotChecked, string>> = {
  arguments: 'Finished agent not checked: watch was given arguments it does not know.',
  input: 'Finished agent not checked: the hook input could not be read.',
  policy: 'Finished agent not checked: the policy could not be read.',
  session: "Finished agent not checked: the session's records could not be read.",
  'agent-not-found': "Finished agent not checked: it is not in the session's records yet.",
};

/**
 * A helper that kept no record (`when-an-agent-finishes.md` R4a), in the person's language and the glossary's words -
 * in the Claude desktop app it is often the only notice that reaches them. Said once a session, and it says so: a
 * person who hears it once should not take a quiet later turn for a later helper that was checked. No `Details:`, since
 * the report holds nothing about it.
 */
const NO_RECORD_WORDS: Readonly<Record<NoticeLang, string>> = {
  en: "A helper finished without leaving a record, so I can't check what it did. I say this once per chat.",
  pl: 'Zakończył się pomocnik, który nie zostawił zapisu, więc nie sprawdzę, co robił. Mówię to raz na rozmowę.',
  de: 'Ein Helfer ist fertig und hat nichts aufgezeichnet, daher kann ich nicht prüfen, was er tat. Ich sage das einmal pro Chat.',
};

/**
 * One notice in words, or no words for nothing to say (`specs/2026-09-16-when-an-agent-finishes.md` R5-R7, R15). It
 * reads counts and enumerations only - the agent's type, how many files, how many attempts - so no path, value,
 * identifier or task description can reach it, whatever the session held. Where the words are shown is decided after
 * this.
 */
export class NoticeWordsRenderer implements Renderer<WatchNotice> {
  render(notice: WatchNotice): string {
    switch (notice.kind) {
      case 'quiet':
        return '';
      case 'not-checked':
        return `${NOT_CHECKED[notice.reason]} ${DETAILS}`;
      case 'no-record':
        return NO_RECORD_WORDS[notice.lang];
      case 'told':
        return TOLD_WORDS[notice.lang];
      case 'read':
        return READ_WORDS[notice.lang][notice.what];
      case 'alert':
        return `${sentenceOf(notice.alert)} ${DETAILS}`;
      case 'turn':
        return turnWords(notice.remembered);
      case 'clean':
        return cleanWords(notice.first, notice.counts, notice.lang);
      case 'preferences-unusable':
        // What a person needs is what is in force now and the way to change it; the file's name is in the command.
        return "Your notification choices could not be read, so agentwhy's own are in use. See: agentwhy notify";
    }
  }
}

/**
 * A key from a private file the person lets their AI read (`the-chat-says-what-the-report-says.md` §5, the `told` row):
 * the words proposed there, unchanged. Not `ROTATE` - the person allowed the read in Settings, and nothing needs to
 * change.
 */
/**
 * A private file's text in the conversation, by what it held (`the-chat-says-what-the-report-says.md` S8, §5): agentwhy's
 * voice, as the clean line's; what to do before `Details`, inside the budget; no path and no service (S9). A template
 * asks to check, since its value may be a placeholder; data cannot be changed, so it asks to see what to do.
 */
const READ_WORDS: Readonly<Record<NoticeLang, Readonly<Record<ReadKind, string>>>> = {
  en: {
    keys: 'I keep watch over your private files. A key from one of them is now in this conversation — change it. Details: agentwhy report --open',
    template: 'I keep watch over your private files. A key from one of them is now in this conversation — check it. Details: agentwhy report --open',
    data: 'I keep watch over your private files. Private data from one of them is now in this conversation — see what to do: agentwhy report --open',
  },
  pl: {
    keys: 'Pilnuję twoich prywatnych plików. Klucz z jednego z nich jest teraz w tej rozmowie — zmień go. Szczegóły: agentwhy report --open',
    template: 'Pilnuję twoich prywatnych plików. Klucz z jednego z nich jest teraz w tej rozmowie — sprawdź go. Szczegóły: agentwhy report --open',
    data: 'Pilnuję twoich prywatnych plików. Prywatne dane z jednego z nich są teraz w tej rozmowie — zobacz, co zrobić: agentwhy report --open',
  },
  de: {
    keys: 'Ich passe auf deine privaten Dateien auf. Ein Schlüssel daraus ist jetzt in dieser Unterhaltung — ändere ihn. Details: agentwhy report --open',
    template: 'Ich passe auf deine privaten Dateien auf. Ein Schlüssel daraus ist jetzt in dieser Unterhaltung — prüfe ihn. Details: agentwhy report --open',
    data: 'Ich passe auf deine privaten Dateien auf. Private Daten daraus sind jetzt in dieser Unterhaltung. Was tun: agentwhy report --open',
  },
};

const TOLD_WORDS: Readonly<Record<NoticeLang, string>> = {
  en: 'I keep watch over your private files. Your AI read one you let it read. Nothing to do. Details: agentwhy report --open',
  pl: 'Pilnuję twoich prywatnych plików. AI przeczytało jeden, na który mu pozwoliłeś. Nic nie trzeba robić. Szczegóły: agentwhy report --open',
  de: 'Ich passe auf deine privaten Dateien auf. Deine KI hat eine gelesen, die du ihr erlaubt hast. Nichts zu tun. Details: agentwhy report --open',
};

/**
 * A turn that found nothing (R4-R6), in the language the person reads (R29). Three lines, and the difference between
 * them is the whole point:
 *
 * - the first quiet turn of a session says the watch is running, which is what silence cannot say;
 * - a later quiet turn says only what this turn found, never what the session holds;
 * - a quiet turn of a session that was not quiet says both, in that order, and says the earlier finding in the
 *   past tense: whether the key has since been rotated is not something a hook can know, and a line reading
 *   "1 value to rotate" at someone who rotated it an hour ago is a line they stop reading.
 *
 * Written for a person who does not build software (R29): the page's own words - a private file, your AI opened it -
 * and "so far", because a clean turn is not a clean session and a line must never read as a promise about the rest.
 * `Details:` is left off the two lines that report nothing: there is nothing in the report to go and look at, and
 * the words are what a notification cuts first. The command stays in English, because it is typed.
 */
function cleanWords(first: boolean, counts: SessionCounts, lang: NoticeLang): string {
  const words = CLEAN_WORDS[lang];
  const told = counts.told ?? 0;
  const data = counts.data ?? 0;
  // The gravest first: a key that should not be here, then private data, then a private file opened, then one the
  // person lets their AI read.
  const earlier = counts.values > 0 ? words.valueEarlier(counts.values)
    : data > 0 ? words.dataEarlier(data)
      : counts.reached > 0 ? words.reachedEarlier(counts.reached)
        : told > 0 ? words.toldEarlier(told) : undefined;

  if (earlier !== undefined) return `${words.nothingNew} ${earlier} ${words.details}: agentwhy report --open`;
  return first ? words.first : words.turn;
}

interface CleanLines {
  /** The first quiet turn of a session: the watch is running, and nothing has been opened so far. */
  readonly first: string;
  /** A later quiet turn, where `every-turn` asked for one. */
  readonly turn: string;
  /** Opens the line of a quiet turn in a session that was not quiet. */
  readonly nothingNew: string;
  readonly valueEarlier: (count: number) => string;
  readonly reachedEarlier: (count: number) => string;
  /** Only files the person lets their AI read were read: said as allowed, never as a key (F57a). */
  readonly toldEarlier: (count: number) => string;
  /** Private data with no key in it (S1, `data`): never said as a key, since none can be made new. */
  readonly dataEarlier: (count: number) => string;
  readonly details: string;
}

const CLEAN_WORDS: Readonly<Record<NoticeLang, CleanLines>> = {
  en: {
    first: "✓ So far your AI hasn't opened any private files. I'm keeping watch.",
    turn: "✓ Your AI didn't open any private files in this reply.",
    nothingNew: 'Nothing new now.',
    valueEarlier: (count) => `Earlier in this chat your AI read ${count === 1 ? 'a key' : `${count} keys`} from a private file.`,
    reachedEarlier: (count) => `Earlier in this chat your AI opened ${count === 1 ? 'a private file' : `${count} private files`}.`,
    toldEarlier: (count) => `Earlier in this chat your AI read ${count === 1 ? 'a private file' : `${count} private files`} you let it read.`,
    dataEarlier: (count) => `Earlier in this chat your AI read private data from ${count === 1 ? 'a private file' : `${count} private files`}.`,
    details: 'Details',
  },
  pl: {
    first: '✓ Jak dotąd AI nie otworzyło żadnego prywatnego pliku. Pilnuję dalej.',
    turn: '✓ W tej odpowiedzi AI nie otworzyło żadnego prywatnego pliku.',
    nothingNew: 'Teraz nic nowego.',
    valueEarlier: (count) =>
      `Wcześniej w tej rozmowie AI przeczytało ${count === 1 ? 'klucz' : `${count} ${polish(count, 'klucze', 'kluczy')}`} z prywatnego pliku.`,
    reachedEarlier: (count) =>
      `Wcześniej w tej rozmowie AI otworzyło ${count === 1 ? 'prywatny plik' : `${count} ${polish(count, 'prywatne pliki', 'prywatnych plików')}`}.`,
    toldEarlier: (count) =>
      `Wcześniej w tej rozmowie AI przeczytało ${count === 1 ? 'prywatny plik' : `${count} ${polish(count, 'prywatne pliki', 'prywatnych plików')}`}, na ${count === 1 ? 'który' : 'które'} mu pozwoliłeś.`,
    dataEarlier: (count) =>
      `Wcześniej w tej rozmowie AI przeczytało prywatne dane z ${count === 1 ? 'prywatnego pliku' : `${count} prywatnych plików`}.`,
    details: 'Szczegóły',
  },
  de: {
    first: '✓ Bisher hat deine KI keine private Datei geöffnet. Ich passe weiter auf.',
    turn: '✓ In dieser Antwort hat deine KI keine private Datei geöffnet.',
    nothingNew: 'Jetzt nichts Neues.',
    valueEarlier: (count) =>
      `Vorhin hat deine KI ${count === 1 ? 'einen Schlüssel' : `${count} Schlüssel`} aus einer privaten Datei gelesen.`,
    reachedEarlier: (count) => `Vorhin hat deine KI ${count === 1 ? 'eine private Datei' : `${count} private Dateien`} geöffnet.`,
    toldEarlier: (count) =>
      `Vorhin hat deine KI ${count === 1 ? 'eine private Datei' : `${count} private Dateien`} gelesen, die du ihr erlaubt hast.`,
    dataEarlier: (count) => `Vorhin hat deine KI private Daten aus ${count === 1 ? 'einer privaten Datei' : `${count} privaten Dateien`} gelesen.`,
    details: 'Details',
  },
};

/** Polish counts two ways past one: 2-4 take one form (22-24 too, 12-14 not), everything else the other. */
function polish(count: number, few: string, many: string): string {
  const units = count % 10;
  const tens = count % 100;
  return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? few : many;
}

function sentenceOf(alert: AgentAlert): string {
  // The session's own agent is the conversation the reader is in. Calling it "an agent" would send them looking for one.
  const who = alert.own === true ? 'This conversation' : alert.type === undefined ? 'An agent' : `${alert.type} agent`;
  const files = alert.filesReached === undefined ? 'protected files' : plural(alert.filesReached, 'protected file', 'protected files');

  // Which levels reach this point is decided by the threshold, before a notice is made. "Reached" counts the agents
  // it started too, which the report shows apart.
  // A value notice is held to the 150 characters a notification shows (`NOTICE_BUDGET`), so once the first clause has
  // said "a protected file", the count that follows says "files" and not "protected files" again.
  // The agent's type is what the transcript recorded: quoted as written, never recased.
  const counted = alert.filesReached === undefined ? 'files' : plural(alert.filesReached, 'file', 'files');

  /*
   * A refusal is the one level that is good news, so it is said as news and asks for nothing
   * (`the-agent-tells-you.md` R3). It is said only where the threshold asked for it, and only when it is the whole
   * story: where a file was reached or a value written, those words come first and the refusals go unmentioned -
   * they are what a notification cuts first, and the report has them either way.
   * The rule is the subject, not the agent: "a rule refused" reads the same for a delegated agent and for the
   * conversation itself, where "this conversation was refused" would not. A rule is named only where a rule refused
   * them all (`who-stopped-it` WS5): what auto mode or the person stopped is said as stopped, by nobody's rule.
   */
  if (alert.level === 'refused') {
    return alert.refusedByOthers === undefined
      ? `${NOTE} ${RULE_REFUSED} ${plural(alert.refusedAttempts, 'attempt', 'attempts')} at protected files; nothing was reached.`
      : `${NOTE} ${plural(alert.refusedAttempts, 'attempt', 'attempts')} at protected files ${alert.refusedAttempts === 1 ? 'was' : 'were'} stopped; nothing was reached.`;
  }
  if (alert.own === true) {
    return alert.level === 'value'
      ? `${ROTATE} a value from a protected file is in this conversation. ${capitalised(counted)} reached.`
      : `${CHECK} ${who} reached ${files}; no value found in its messages.`;
  }
  return alert.level === 'value'
    ? `${ROTATE} ${who} wrote a value from a protected file; its answer may carry it. ${capitalised(counted)} reached.`
    : `${CHECK} ${who} reached ${files}; no value found in its messages.`;
}

/**
 * A turn's worth of remembered alerts in one line (`a-notice-in-the-conversation.md` R12). One agent says exactly
 * what its own notice said, so nothing is rewritten on the way; several are counted, because a line that listed
 * them would be cut before the reader reached the end. What could not be checked is said too, never dropped.
 */
export function turnWords(remembered: readonly RememberedAlert[]): string {
  const [only] = remembered;
  if (only === undefined) return '';
  if (remembered.length === 1) return only.words;

  const checked = remembered.filter((alert) => alert.level !== 'not-checked');
  const missed = remembered.length - checked.length;
  const unchecked = `${plural(missed, 'agent', 'agents')} could not be checked`;
  if (checked.length === 0) return `${CHECK} ${unchecked}. ${DETAILS}`;

  /*
   * A refused agent reached nothing, so it cannot be counted among the agents that did: a line saying "3 agents
   * reached protected files" about two refusals and one reach would be false in the direction that matters. Where
   * something was reached, the refusals go unsaid, exactly as they do in one agent's own notice.
   */
  const reached = checked.filter((alert) => alert.level === 'value' || alert.level === 'reached');
  const values = reached.filter((alert) => alert.level === 'value').length;
  const head = reached.length === 0
    // A rule is credited only where a rule refused every one of them (WS5): the record says where it did not.
    ? checked.every((alert) => alert.notByRule !== true)
      ? `${NOTE} ${RULE_REFUSED} attempts by ${plural(checked.length, 'agent', 'agents')}; nothing was reached`
      : `${NOTE} attempts by ${plural(checked.length, 'agent', 'agents')} at protected files were stopped; nothing was reached`
    : values === 0
      ? `${CHECK} ${plural(reached.length, 'agent', 'agents')} reached protected files; no value found in their messages`
      : values === reached.length
        ? `${ROTATE} ${plural(values, 'agent', 'agents')} wrote a value from a protected file; their answers may carry it`
        : `${ROTATE} ${plural(reached.length, 'agent', 'agents')} reached protected files, ${values} wrote a value from one`;
  return `${head}${missed === 0 ? '' : `; ${unchecked}`}. ${DETAILS}`;
}

function capitalised(words: string): string {
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
