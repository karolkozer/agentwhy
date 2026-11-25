// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0

/**
 * A variable each AI puts in the environment of every command it runs, each one measured with `env -i` on 2026-11-20
 * (`2026-11-20-it-runs-by-itself` RBB1-RBB3) - none of them guessed. Claude Code's `AI_AGENT` is left out: the
 * desktop app set it and a terminal session did not.
 */
const SET_FOR_AN_AI_COMMAND: readonly string[] = [
  // Claude Code 2.1.326 in the desktop app, 2.1.308 in a terminal (RBB1).
  'CLAUDECODE',
  // Codex 0.166.0, `codex exec` (RBB2).
  'CODEX_THREAD_ID',
  'CODEX_TOOL_CALL_ID',
  // GitHub Copilot CLI 1.0.112 (RBB3).
  'COPILOT_AGENT_SESSION_ID',
];

/**
 * Whether this command was run by an AI rather than typed by a person (RB7, RBD6): one of the AIs' own variables is
 * set **and** standard input is no terminal. Every command the three ran had none (RBB4), and a person at a terminal is
 * never taken for an AI, whatever their terminal inherited - so nothing a person does today is refused.
 */
export function runByAnAi(variables: Readonly<Record<string, string | undefined>> | undefined, inputIsTerminal: boolean): boolean {
  if (inputIsTerminal || variables === undefined) return false;
  return SET_FOR_AN_AI_COMMAND.some((name) => (variables[name] ?? '') !== '');
}

/**
 * The conversation a command Claude Code's AI runs belongs to, or `undefined` where nothing says: `CLAUDE_CODE_SESSION_ID`,
 * which Claude Code sets for every command its AI runs, equal to the id a skill's `${CLAUDE_SESSION_ID}` is filled with -
 * measured 2026-11-22 on 2.1.308 in `claude -p` under `env -i` and in the desktop app, and set anew by a `claude` started
 * inside another conversation (`2026-11-20-ask-your-ai-why.md` AYB13). Read for `why --plugin` alone (AYO9).
 */
export function conversationOfTheAi(variables: Readonly<Record<string, string | undefined>> | undefined): string | undefined {
  const id = variables?.['CLAUDE_CODE_SESSION_ID'];
  return id === undefined || id === '' ? undefined : id;
}
