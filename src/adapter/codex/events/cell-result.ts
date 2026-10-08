// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { CELL_RESULT } from '../contract/deliveries.ts';

/**
 * The exit code of the one command a cell ran, where the cell returned the call's whole result (XD4a, spec §2.11).
 *
 * The cell's text holds Codex's header and then whatever the script returned; where that is the result of a single
 * `tools.exec_command`, it is a JSON object carrying the command's own `exit_code`. Without it a command read from a
 * cell has no recorded end, which is what leaves its access unestablished.
 *
 * `undefined` where the cell holds no such object, or more than one: a cell that ran several commands holds one each,
 * and which belongs to which is not recorded, so pairing them by position would be a guess (L005).
 */
export function cellExitCode(text: string): number | undefined {
  const found: number[] = [];
  for (let at = text.indexOf('{'); at >= 0 && found.length < 2; at = text.indexOf('{', at + 1)) {
    const exitCode = exitCodeOfObjectAt(text, at);
    if (exitCode !== undefined) found.push(exitCode);
  }
  return found.length === 1 ? found[0] : undefined;
}

/** The `exit_code` of the result object starting at `at`, or `undefined` where no whole one starts there. */
function exitCodeOfObjectAt(text: string, at: number): number | undefined {
  // The opening key is what tells a result object from any other braces the output happens to hold.
  if (!text.startsWith('{' + CELL_RESULT.opensWith, at)) return undefined;
  const end = endOfObject(text, at);
  if (end === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(at, end));
  } catch {
    // A result object cut short by a cap on what the cell returned establishes nothing, and is no error here.
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const exitCode = (parsed as Record<string, unknown>)[CELL_RESULT.exitCode];
  return typeof exitCode === 'number' && Number.isInteger(exitCode) ? exitCode : undefined;
}

/** Where the object starting at `at` ends, counting braces outside strings; `undefined` where it never closes. */
function endOfObject(text: string, at: number): number | undefined {
  let depth = 0;
  for (let position = at; position < text.length; position += 1) {
    const character = text[position];
    if (character === '"') {
      position = endOfString(text, position);
      continue;
    }
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return position + 1;
    }
  }
  return undefined;
}

/** The index of the closing quote of the string opening at `at`, or the end of the text where it never closes. */
function endOfString(text: string, at: number): number {
  for (let position = at + 1; position < text.length; position += 1) {
    if (text[position] === '\\') {
      position += 1;
      continue;
    }
    if (text[position] === '"') return position;
  }
  return text.length;
}
