// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Redacted } from '../../../core/redaction/redacted.ts';
import type { NoticeLang } from '../notice-choices.ts';

/**
 * What the session's own agent is asked to say, when a finding is set to be said by it
 * (`specs/2026-09-21-the-agent-tells-you.md` §5, R12, R12a, R12b). These are the words eleven sessions of eleven
 * relayed, and they are the third version: the two before them were refused, and for reasons worth keeping in view.
 *
 * - **It is agentwhy's finding, passed on as agentwhy's.** The first version told the agent to assert it in its own
 *   voice, and a session refused: it was being told to state as fact something it could not check.
 * - **Nothing is forbidden but going back to the file.** That same version forbade the agent to confirm anything,
 *   which - together with the claim above - is what an injection asks for, and was named as such.
 * - **No link.** A version carrying a `file://` address to a page outside the project lost the agent on that alone
 *   (B9g), so the offer is a command, named as what it is.
 * - **Only what the records establish.** A session handed a claim that did not match its own context refused it and
 *   said so to the person (R12b). The consequence is worded as what the records show - the conversation and the
 *   session's own files - and not as a fact about a provider's infrastructure.
 *
 * *Fourth version, 2026-10-02 (`the-agent-tells-you.md` R12c):* the third was relayed in full, and in full it was three
 * paragraphs - session records, rotating a credential - which the maintainer, reading it in the Claude desktop app,
 * found too long for someone who does not write code. So it asks for what the Codex request already asks for (CK13 of
 * `codex-blocks-too`): at most three short sentences, opening with agentwhy's name, in the glossary's words (a private
 * file, a key, make a new one). Everything the third kept safe is kept.
 */
export function instructionFor(files: readonly Redacted[], command: string): string {
  const named = files.slice(0, NAMED_AT_MOST);
  const rest = files.length - named.length;
  const which = named.length === 0
    ? 'a private file'
    : `the private ${named.length === 1 ? 'file' : 'files'} ${list(named)}${rest === 0 ? '' : ` and ${rest} more`}`;
  // What the agent is asked not to do is said about the same files it was just told about, in the same words.
  const them = named.length <= 1 ? 'it' : 'them';

  return [
    `agentwhy, the local tool this user runs, checked this turn: a key from ${which} is now in this conversation.`,
    'Tell the user in at most three short sentences, in the language of this conversation and in plain everyday words',
    'for someone who does not write code, starting with **agentwhy**: that agentwhy noticed this; that they should make',
    'a new key today where this one was issued, because deleting the chat does not undo it; and ask whether to open',
    `agentwhy's report, running \`${command}\` only if they say yes.`,
    `You read ${named.length === 0 ? 'it' : which} in this conversation, so you can see this yourself.`,
    `Do not open or read ${them} again, do not repeat the key, and do not continue the earlier task in this message.`,
  ].join(' ');
}

/**
 * The same, for private files the person lets the agent read - tracked rather than blocked in agentwhy's Settings
 * (F57; `the-chat-says-what-the-report-says.md` S6 and §6, `told`). Asked for by the maintainer on 2026-10-02: the
 * words for a blocked file, "make a new key today", are for a file read that should not have been, and said of a file
 * the person allowed they are an alarm about nothing. So the agent says it read a file it was allowed to, that nothing
 * needs to change, and offers the report, which shows what was read. The rest is `instructionFor`'s.
 */
export function toldInstructionFor(files: readonly Redacted[], command: string): string {
  const named = files.slice(0, NAMED_AT_MOST);
  const rest = files.length - named.length;
  const which = named.length === 0
    ? 'a private file'
    : `the private ${named.length === 1 ? 'file' : 'files'} ${list(named)}${rest === 0 ? '' : ` and ${rest} more`}`;
  const them = named.length <= 1 ? 'it' : 'them';

  return [
    `agentwhy, the local tool this user runs, checked this turn: you read ${which}, which this user lets you read -`,
    `they set ${them} to be tracked, not blocked, in agentwhy's settings.`,
    'Tell the user in at most two short sentences, in the language of this conversation and in plain everyday words for',
    'someone who does not write code, starting with **agentwhy**: that agentwhy noticed you read a private file they',
    'allowed, so nothing needs to change; and ask whether to open agentwhy\'s report, which shows what was read, running',
    `\`${command}\` only if they say yes.`,
    `Do not open or read ${them} again, do not repeat anything from ${them}, and do not continue the earlier task in this message.`,
  ].join(' ');
}

/**
 * The same, for private data - a file of the conversation's that agentwhy recognises no key in (`the-chat-says-what-the-
 * report-says.md` S1, S6 and §6, `data`). A key can be replaced and data cannot, so "make a new key" said of a customer
 * list is advice that does nothing - the agent contradicted it in the session that found this (§1). The agent says what
 * cannot be taken back and offers the report, which shows how to limit the damage and protect the file.
 */
export function dataInstructionFor(files: readonly Redacted[], command: string): string {
  const { which, them } = named(files);
  return [
    `agentwhy, the local tool this user runs, checked this turn: private data from ${which} is now in this conversation,`,
    'and agentwhy recognises no key in it.',
    'Tell the user in at most three short sentences, in the language of this conversation and in plain everyday words',
    'for someone who does not write code, starting with **agentwhy**: that agentwhy noticed this; that it cannot be taken',
    'back, and agentwhy\'s report shows how to limit the damage and protect the file; and ask whether to open it, running',
    `\`${command}\` only if they say yes.`,
    `You read ${which} in this conversation, so you can see this yourself.`,
    `Do not open or read ${them} again, do not repeat anything from ${them}, and do not continue the earlier task in this message.`,
  ].join(' ');
}

/**
 * The same, for a file named as a template - `.env.example` (S6, `template`): its value may be a placeholder or a real
 * key, and the agent read it, so it can say which it looks like - without repeating it.
 */
export function templateInstructionFor(files: readonly Redacted[], command: string): string {
  const { which, them } = named(files);
  return [
    `agentwhy, the local tool this user runs, checked this turn: a value from ${which}, named as a template, is now in`,
    'this conversation. Tell the user in at most three short sentences, in the language of this conversation and in plain',
    'everyday words for someone who does not write code, starting with **agentwhy**: that agentwhy noticed this; whether',
    'the value looks like a real key or a placeholder, and that a real one should be made new where it was issued; and ask',
    `whether to open agentwhy's report, running \`${command}\` only if they say yes.`,
    `You read ${which} in this conversation, so you can see this yourself.`,
    `Do not open or read ${them} again, do not repeat the value, and do not continue the earlier task in this message.`,
  ].join(' ');
}

/** The files an instruction names - three at most, then how many more - and the pronoun that refers back to them. */
function named(files: readonly Redacted[]): { readonly which: string; readonly them: string } {
  const shown = files.slice(0, NAMED_AT_MOST);
  const rest = files.length - shown.length;
  return {
    which: shown.length === 0
      ? 'a private file'
      : `the private ${shown.length === 1 ? 'file' : 'files'} ${list(shown)}${rest === 0 ? '' : ` and ${rest} more`}`,
    them: shown.length <= 1 ? 'it' : 'them',
  };
}

/**
 * The first quiet turn of a session, said by the agent (`the-agent-tells-you.md` R5, amended 2026-10-02): where the line
 * is folded away or easily passed, the one sentence that says agentwhy is keeping watch. agentwhy's claim, passed on as
 * agentwhy's, so the agent is not asked to vouch for files it cannot know are private; nothing to offer, since there
 * is nothing to see in a report.
 */
export function cleanInstruction(): string {
  return [
    'agentwhy, the local tool this user runs, checked this conversation so far: none of the private files it watches',
    'has been opened. Tell the user in one short sentence, in the language of this conversation and in plain everyday',
    'words for someone who does not write code, starting with **agentwhy**: that agentwhy is keeping watch over their',
    'private files and none has been opened so far. Do not ask anything, and do not continue the earlier task in this',
    'message.',
  ].join(' ');
}

/**
 * How many files the instruction names before it counts the rest. Three keeps it inside what a person reads in one
 * go - and the person reads it too, framed as `Stop hook error:` in the terminal (B9a, R12a).
 */
const NAMED_AT_MOST = 3;

/**
 * The command the agent offers to run: this session by its id, and nothing of what the report holds (R18, R19), with
 * agentwhy invoked the way the hook invokes it. *Changed 2026-10-02 (`2026-10-02-said-where-the-person-is.md` SW10):*
 * `start` writing every conversation of the project, opening this one's report among them, so its "All conversations"
 * leads back to them - `report --open` opened a page alone, with nowhere to go back to. *Changed again the same day
 * (`2026-10-02-a-page-not-a-file.md` PF5):* served from the background (`--detach`), so the page is live - marks, Settings,
 * new conversations - and the agent's call still returns at once; a server already running for the project is reused.
 */
export function reportCommand(sessionId: string, invocation: string): string {
  return `${invocation} start --detach --session ${sessionId} --quiet`;
}

function list(files: readonly Redacted[]): string {
  const [one, two, three] = files;
  if (three !== undefined) return `${one}, ${two} and ${three}`;
  if (two !== undefined) return `${one} and ${two}`;
  return String(one);
}

/**
 * What the session's own agent is asked to say, by finding: the requests one AI's hook hands its agent. Claude Code's are
 * this file's, in English as measured (R12c), folded in its apps; Codex shows them whole, so its are short and in the
 * person's language (`2026-10-02-codex-says-it-too.md` CX3).
 */
export interface AgentRequests {
  keys(files: readonly Redacted[], command: string, lang: NoticeLang, foldsTurn?: boolean): string;
  template(files: readonly Redacted[], command: string, lang: NoticeLang, foldsTurn?: boolean): string;
  data(files: readonly Redacted[], command: string, lang: NoticeLang, foldsTurn?: boolean): string;
  /** `foldsTurn`: the app hides the turn's answer behind a block (CXB5), so the request asks it back - told and quiet only. */
  told(files: readonly Redacted[], command: string, lang: NoticeLang, foldsTurn?: boolean): string;
  quiet(lang: NoticeLang, foldsTurn?: boolean): string;
}

/** Claude Code's: the language is the conversation's, which the agent answers in whatever it is asked in. */
export const CLAUDE_CODE_REQUESTS: AgentRequests = {
  keys: (files, command) => instructionFor(files, command),
  template: (files, command) => templateInstructionFor(files, command),
  data: (files, command) => dataInstructionFor(files, command),
  told: (files, command) => toldInstructionFor(files, command),
  quiet: () => cleanInstruction(),
};
