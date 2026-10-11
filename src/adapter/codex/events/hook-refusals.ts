// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { HOOK_REFUSAL } from '../contract/hook-refusals.ts';

/** One command `refuse --codex` stopped, as a cell's output records it. */
export interface HookRefusal {
  /** The path the reason names: the one the command named, a glob expanded to, or a search would have read. */
  readonly path: string;
  /** The rule's pattern, as the reason gives it. */
  readonly pattern: string;
  /** The refused line, where Codex's words after the reason give it. */
  readonly command?: string;
  /** agentwhy's reason, as the model was handed it. */
  readonly reason: string;
}

/**
 * agentwhy's own reason (`refuse/render/refusal-words.ts` `refusalReason`), after Codex's words for a hook's refusal: "it
 * names P", "W expands to P" or "this search would read P", then which policy protects it - "this project's" for a
 * rule the project wrote, "the computer-wide" for one written outside every project (`protected-everywhere.md` G16).
 * A test reads `refusalReason`'s own sentences back through this, so the two cannot drift apart unnoticed.
 */
const REFUSED = new RegExp(
  escaped(HOOK_REFUSAL.blocked) +
    "(agentwhy refused this command: (?:it names (.+?)|\\S+ expands to (.+?)|this search would read (.+?)), which (?:this project's|the computer-wide) policy protects \\((.+?)\\)[^\\n]*?)" +
    '(?:' + escaped(HOOK_REFUSAL.command) + '([^\\n]*))?$',
  'gm',
);

/**
 * Every command agentwhy's Codex hook refused in one cell's output, in order (CK12). A hook's refusal in any other words
 * is not read: Codex types none (XB1), and a reason nobody here wrote is not guessed at.
 */
export function hookRefusalsIn(text: string): HookRefusal[] {
  return textsOf(text).flatMap((one) => [...one.matchAll(REFUSED)].flatMap((match) => {
    const path = match[2] ?? match[3] ?? match[4];
    const pattern = match[5];
    const reason = match[1];
    if (path === undefined || pattern === undefined || reason === undefined) return [];
    const command = match[6]?.trim();
    return [{ path, pattern, reason, ...(command === undefined || command === '' ? {} : { command }) }];
  }));
}

/**
 * A cell's text with agentwhy's refusals taken out - a line Codex opens with its words for a hook's refusal, or a JSON
 * string that opens with them (§2.15). They are agentwhy's words and name the refused file; read as a return that
 * carried a command's output, the name `rg --files` printed was found twice - in its own return and in the next cell's
 * refusal - and so in no one return, and the listing stayed "not known to be whole" (§2.18, 2026-10-10).
 */
export function withoutRefusals(text: string): string {
  let kept = '';
  let from = 0;
  for (let at = text.indexOf(HOOK_REFUSAL.blocked); at >= 0; at = text.indexOf(HOOK_REFUSAL.blocked, at + 1)) {
    if (at <= from || text[at - 1] !== '"') continue;
    const close = closingQuote(text, at - 1);
    if (close === undefined) continue;
    kept += text.slice(from, at - 1);
    from = close + 1;
    at = close;
  }
  return (kept + text.slice(from)).replace(REFUSED, '');
}

/**
 * CK12 as amended 2026-10-10 (`what-codex-wrote` §2.15): the texts a refusal is read in. Codex's words open a line of
 * the cell's text where the script stopped on the refusal (114 of 118 measured), or open a JSON string where the code
 * settled its calls together and returned each rejection as JSON - `{"status":"rejected","reason":"Command blocked by
 * PreToolUse hook: … Command: <line>"}` (4 of 118, every one right after `"reason":"`). Read as the text around it, that
 * line ran on into the `"}}` closing the JSON and named a file that is not there; a string that opens with Codex's words
 * is read decoded, as the script handed it, and anything that does not decode is read as it stands.
 */
function textsOf(text: string): string[] {
  const texts: string[] = [];
  let from = 0;
  for (let at = text.indexOf(HOOK_REFUSAL.blocked); at >= 0; at = text.indexOf(HOOK_REFUSAL.blocked, at + 1)) {
    if (at <= from || text[at - 1] !== '"') continue;
    const close = closingQuote(text, at - 1);
    const decoded = close === undefined ? undefined : jsonString(text.slice(at - 1, close + 1));
    if (close === undefined || decoded === undefined) continue;
    texts.push(text.slice(from, at - 1), decoded);
    from = close + 1;
    at = close;
  }
  texts.push(text.slice(from));
  return texts;
}

/** The index of the quote that closes the JSON string opening at `at`; `undefined` where it never closes. */
function closingQuote(text: string, at: number): number | undefined {
  for (let position = at + 1; position < text.length; position += 1) {
    if (text[position] === '\\') position += 1;
    else if (text[position] === '"') return position;
  }
  return undefined;
}

function jsonString(literal: string): string | undefined {
  try {
    const value: unknown = JSON.parse(literal);
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
