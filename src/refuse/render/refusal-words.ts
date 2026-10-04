// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { HOOK_OUTPUT } from '../../adapter/claude-code/contract/hooks.ts';
import type { RefusalNotChecked, RefusalRoute } from '../command-refusal.ts';

/** Why a command ran without being checked, including arguments the command itself could not use. */
export type NotCheckedReason = RefusalNotChecked | 'arguments';

const NOT_CHECKED: Readonly<Record<NotCheckedReason, string>> = {
  arguments: 'agentwhy refuse was given arguments it does not recognise, so this command was not checked.',
  input: 'agentwhy refuse could not read the hook input, so this command was not checked.',
  policy: 'agentwhy refuse could not read the policy it was given, so this command was not checked.',
  search: 'agentwhy refuse could not look through everything this search reaches, so this command was not checked.',
  project: 'agentwhy refuse found no project above this folder whose Claude Code settings run refuse, so it could not read the rules it was pointed at and this command was not checked.',
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
export function refusalReason(path: string, pattern: string, others: number, route: RefusalRoute): string {
  const more = others === 0 ? '' : `, and ${others} more protected ${others === 1 ? 'path' : 'paths'}`;
  return (
    `agentwhy refused this command: ${howItReaches(route, path)}, which this project's policy protects (${pattern})${more}. ` +
    "Protected files are kept out of the agent's reach. Tell the user agentwhy blocked the command. " +
    "Do not ask them to paste this file or a secret value into the chat; they can inspect it in their IDE.\n"
  );
}

function howItReaches(route: RefusalRoute, path: string): string {
  switch (route.kind) {
    case 'named':
      return `it names ${path}`;
    case 'glob':
      return `${route.word} expands to ${path}`;
    case 'search':
      return `this search would read ${path}`;
  }
}
