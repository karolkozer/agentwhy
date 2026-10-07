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
  return [...text.matchAll(REFUSED)].flatMap((match) => {
    const path = match[2] ?? match[3] ?? match[4];
    const pattern = match[5];
    const reason = match[1];
    if (path === undefined || pattern === undefined || reason === undefined) return [];
    const command = match[6]?.trim();
    return [{ path, pattern, reason, ...(command === undefined || command === '' ? {} : { command }) }];
  });
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
