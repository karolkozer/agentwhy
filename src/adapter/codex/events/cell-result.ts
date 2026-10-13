// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { CELL_RESULT, PAIRED_CELL } from '../contract/deliveries.ts';
import type { CellPairing } from './cell-commands.ts';

/**
 * The exit code of the one command a cell ran, where the cell returned the call's whole result (XD4a, spec §2.11).
 *
 * The cell's text holds Codex's header and then whatever the script returned; where that is the result of a single
 * `tools.exec_command`, it is a JSON object carrying the command's own `exit_code`. Without it a command read from a
 * cell has no recorded end, which is what leaves its access unestablished.
 *
 * `undefined` where the cell holds no such object, or more than one: a cell that ran several commands holds one each,
 * and which belongs to which is not recorded, so pairing them by position would be a guess (L005). Where the code
 * labelled each by its place, the label says it: `settledResults` (EC1).
 */
export function cellExitCode(text: string): number | undefined {
  const found: number[] = [];
  for (const result of resultObjectsIn(text)) {
    const exitCode = result[CELL_RESULT.exitCode];
    if (typeof exitCode === 'number' && Number.isInteger(exitCode)) found.push(exitCode);
    if (found.length > 1) return undefined;
  }
  return found[0];
}

/**
 * One command's end, as a cell whose code says whose each part is returned it (`2026-10-13-each-command-its-own-result.md`):
 * its result object and the part that holds it, only what it printed, or a call that was rejected.
 */
export type PairedResult =
  | { readonly status: 'fulfilled'; readonly part: string; readonly value: Readonly<Record<string, unknown>> }
  | { readonly status: 'printed'; readonly part: string }
  | { readonly status: 'rejected' };

/**
 * Each command's part of a cell's return, in the code's order of its commands, where the code says whose each part is:
 * by the label it wrote from the place, never by the order of the parts (EC1), or by that order, where each command
 * emitted one part in turn (EC6, EC7). `undefined` where the return is not one part for each of the `count` commands;
 * under a label, also where a part is no JSON object, a label is no whole number from 0 to `count - 1` or is given twice,
 * or a settled result is of another shape. In order, a part that should hold a result object and holds none, or several,
 * gives its command nothing - a rejected call's reason, say.
 */
export function pairedResults(parts: readonly string[], pairing: CellPairing, count: number): (PairedResult | undefined)[] | undefined {
  if (parts.length !== count) return undefined;
  if (pairing.by === 'order') return parts.map((part, at) => (pairing.emits[at] === 'output' ? { status: 'printed', part } : resultIn(part)));
  const form = pairing;
  const found: (PairedResult | undefined)[] = Array.from({ length: count }, () => undefined);
  for (const part of parts) {
    const object = jsonObject(part);
    const label = object?.[form.label];
    if (object === undefined || typeof label !== 'number' || !Number.isInteger(label) || label < 0 || label >= count || found[label] !== undefined) {
      return undefined;
    }
    const settled = form.spread ? object : asObject(object[PAIRED_CELL.result]);
    const value = asObject(settled?.[PAIRED_CELL.value]);
    if (settled?.[PAIRED_CELL.status] === PAIRED_CELL.fulfilled && value !== undefined) found[label] = { status: 'fulfilled', part, value };
    else if (settled?.[PAIRED_CELL.status] === PAIRED_CELL.rejected) found[label] = { status: 'rejected' };
    else return undefined;
  }
  return found;
}

/** EC6, EC7: the one result object a part holds, at any depth - the part itself, a settled `value`, a `result`'s. */
function resultIn(part: string): PairedResult | undefined {
  const object = jsonObject(part);
  const found: Record<string, unknown>[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (asObject(value) !== undefined) {
      const each = value as Record<string, unknown>;
      if (Object.hasOwn(each, CELL_RESULT.chunkId)) found.push(each);
      else Object.values(each).forEach(visit);
    }
  };
  visit(object);
  return found.length === 1 && found[0] !== undefined ? { status: 'fulfilled', part, value: found[0] } : undefined;
}

function jsonObject(text: string): Record<string, unknown> | undefined {
  try {
    return asObject(JSON.parse(text));
  } catch {
    // A part that is no JSON - a text the script emitted of its own - is no settled result.
    return undefined;
  }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/**
 * The `output` of every whole result object a cell's text holds (§2.16): what a command printed, as the cell handed it
 * to the model inside the JSON `text(r)` returned - escaped, so the printed text itself never occurs in the return.
 */
export function cellResultOutputs(text: string): string[] {
  return resultObjectsIn(text).flatMap((result) => {
    const output = result[CELL_RESULT.output];
    return typeof output === 'string' ? [output] : [];
  });
}

/**
 * `2026-10-11-the-file-by-its-text.md` CT9: every string a cell's text holds - each part's own, and every string of a part
 * that is JSON, read through: `{chunk_id, …, output}`, `{i, result}`, `{status, value}` and the rest CTB4 counted. A cell
 * that ran several commands, or built them while it ran, returned what they printed so, and it is no one command's; read
 * for a private file's lines alone (CT1), it says which file the cell showed, whichever key held it.
 */
export function cellStrings(text: string): string[] {
  const strings = [text, ...cellResultOutputs(text)];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) continue;
    try {
      stringsOf(JSON.parse(trimmed), strings);
    } catch {
      // A part cut short, or text that only opens like JSON: its own text is already among the strings.
    }
  }
  return strings;
}

function stringsOf(value: unknown, into: string[]): void {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) value.forEach((each) => stringsOf(each, into));
  else if (typeof value === 'object' && value !== null) Object.values(value).forEach((each) => stringsOf(each, into));
}

/** The whole result objects of a cell's text, in the order it holds them. */
function resultObjectsIn(text: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  for (let at = text.indexOf('{'); at >= 0; at = text.indexOf('{', at + 1)) {
    const result = resultObjectAt(text, at);
    if (result !== undefined) found.push(result);
  }
  return found;
}

/** The result object starting at `at`, or `undefined` where no whole one starts there. */
function resultObjectAt(text: string, at: number): Record<string, unknown> | undefined {
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
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
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
