// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { CELL_COMMANDS, CELL_SCRIPT_ERROR } from '../contract/deliveries.ts';

/** The constructor of an async function: it compiles a body as one, and building it never calls it. */
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (body: string) => unknown;

/**
 * Whether a cell's script never started (§2.15, measured 2026-10-10): Codex says it failed on a `SyntaxError`, and its
 * code does not compile here either, with the same words. A script that does not compile runs no statement of itself,
 * so no command it writes out ran; the conversation of 2026-10-10 that showed "Couldn't check fully" for two commands
 * held a cell of `missing ) after argument list`, and the same two commands again in the next cell, refused.
 *
 * Codex's words alone are not enough: a script that compiled can raise a `SyntaxError` while it runs - `JSON.parse`,
 * `eval` - after its commands. Compiling the code here tells the two apart, and it is only compiled, never called. Of
 * 2,752 cells, 14 said `SyntaxError`, all 14 failed to compile here with the identical message, and none of the 2,738
 * others failed to; where a newer or older engine words it otherwise, the two differ and the commands are read as before.
 */
export function neverStarted(code: string, text: string): boolean {
  if (!text.startsWith(CELL_COMMANDS.failedHeader)) return false;
  const opens = text.indexOf(CELL_SCRIPT_ERROR.opens + CELL_SCRIPT_ERROR.syntaxError);
  if (opens < 0) return false;
  const message = text.slice(opens + CELL_SCRIPT_ERROR.opens.length + CELL_SCRIPT_ERROR.syntaxError.length).split('\n')[0];
  return message !== undefined && message !== '' && compileError(code) === message;
}

/** The message of the `SyntaxError` compiling the code as an async function's body raises; `undefined` where it compiles. */
function compileError(code: string): string | undefined {
  try {
    void new AsyncFunction(code);
    return undefined;
  } catch (error) {
    return error instanceof SyntaxError ? error.message : undefined;
  }
}
