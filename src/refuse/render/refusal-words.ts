// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { HOOK_OUTPUT } from '../../adapter/claude-code/contract/hooks.ts';
import type { RefusalNotChecked, RefusalRoute, RuleOwner } from '../command-refusal.ts';

/** Why a command ran without being checked, including arguments the command itself could not use. */
export type NotCheckedReason = RefusalNotChecked | 'arguments';

const NOT_CHECKED: Readonly<Record<NotCheckedReason, string>> = {
  arguments: 'agentwhy refuse was given arguments it does not recognise, so this command was not checked.',
  input: 'agentwhy refuse could not read the hook input, so this command was not checked.',
  policy: 'agentwhy refuse could not read the policy it was given, so this command was not checked.',
  search: 'agentwhy refuse could not look through everything this search reaches, so this command was not checked.',
  project: 'agentwhy refuse found no project above this folder whose Claude Code settings run refuse, so it could not read the rules it was pointed at and this command was not checked.',
  place: 'agentwhy refuse could not tell which folder Codex runs this command in, so this command was not checked.',
};

/** Said to the user, as a hook's JSON on stdout, when a command ran without being checked (R20). */
export function notCheckedMessage(reason: NotCheckedReason): string {
  return JSON.stringify({ [HOOK_OUTPUT.systemMessage]: NOT_CHECKED[reason] });
}

/**
 * What the agent is told when a command is refused (R19). A named path is the one the agent just wrote, so naming it
 * tells the model nothing new. A path reached through a glob or a search is one the agent did not write: its name is
 * given - a listing of the directory would show it anyway - and never anything from inside it (R21a). No other route
 * is suggested. The person can inspect the file locally without putting its contents in the conversation.
 */
export function refusalReason(path: string, pattern: string, others: number, route: RefusalRoute, owner: RuleOwner = 'project'): string {
  const more = others === 0 ? '' : `, and ${others} more protected ${others === 1 ? 'path' : 'paths'}`;
  return (
    `agentwhy refused this command: ${howItReaches(route, path)}, which ${WHOSE[owner]} protects (${pattern})${more}. ` +
    (route.kind === 'byName' ? byName(path, pattern) : route.kind === 'found' ? found(route.word) : "Protected files are kept out of the agent's reach. ") +
    'Tell the user agentwhy blocked the command. ' +
    "Do not ask them to paste this file or a secret value into the chat; they can inspect it in their IDE.\n"
  );
}

/**
 * Whose policy the sentence names. G16: under a rule written for the whole computer there is no project whose policy
 * this is - a session may be running where no project is at all - so the sentence names the policy a person can
 * actually go and change. `2026-10-11-the-rules-where-the-file-is.md` RW5: nor is a rule of the project the file is in
 * this project's, where the line runs elsewhere. The project is not named: a folder's name may hold a bracket or a comma,
 * which the two readers of this sentence would then misread (RWD5). Both read every one of these words.
 */
export const WHOSE: Readonly<Record<RuleOwner, string>> = {
  project: "this project's policy",
  computer: 'the computer-wide policy',
  elsewhere: 'the policy of the project it is in',
};

/**
 * `2026-10-09-the-file-not-its-name.md` FND9, from FNB23: a word met only by its name, in a folder the line does not let
 * `refuse` follow (FN6). The rule is for one file, and the agent asked about another of that name took the refusal for
 * its own file's and stopped. So the sentence after the parsed one (`refusedReach`, Codex's `hookRefusalsIn` read only
 * that one) says which file the rule is for, and that a file of that name elsewhere, named by its path, is not this rule's.
 */
function byName(word: string, pattern: string): string {
  const name = word.slice(word.lastIndexOf('/') + 1);
  const file = pattern.replace(/^\*\*\//, '');
  return `The rule is for ${file} alone: this command names ${name} in a folder agentwhy cannot follow, so it was stopped for that file. ` +
    `Another file called ${name}, named by its path from the project's folder, is not stopped by this rule. `;
}

/**
 * `2026-10-11-a-folder-found-while-it-runs.md` FW1: the line reads a folder it finds while it runs, so `refuse` cannot
 * tell it from one holding a protected file - said after the parsed sentence, as FND9's is, with the way to a checked run.
 */
function found(word: string): string {
  return `It reads ${word}, a folder it only finds while it runs, so agentwhy cannot tell it is not one holding a protected file. ` +
    "Name the folder by its path and the command can be checked. ";
}

function howItReaches(route: RefusalRoute, path: string): string {
  switch (route.kind) {
    case 'named':
    case 'byName':
      return `it names ${path}`;
    case 'glob':
      return `${route.word} expands to ${path}`;
    case 'search':
    case 'found':
      return `this search would read ${path}`;
  }
}
