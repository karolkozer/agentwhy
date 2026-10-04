// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * What a person may type when `init` asks what else to protect (`specs/2026-09-16-worth-running-every-day.md` R4c).
 * A pattern is written into a deny rule as `Read(<pattern>)`, so a bracket would end the rule early and a control
 * character would make a file nobody can read. Both are refused by name rather than quietly stripped: a pattern
 * silently changed protects something other than what was asked for.
 */
export interface Patterns {
  readonly patterns: readonly string[];
  /** What was refused, each with the reason, in the words the person typed. */
  readonly refused: readonly { readonly pattern: string; readonly reason: string }[];
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const LONGEST = 200;

/** Splits what was typed on commas, and separates what can be written from what cannot. */
export function patternsIn(typed: string): Patterns {
  return patternsOf(typed.split(',').map((pattern) => pattern.trim()));
}

/** The same rules for patterns given one at a time, as `--protect` gives them. */
export function patternsOf(given: readonly string[]): Patterns {
  const patterns: string[] = [];
  const refused: { pattern: string; reason: string }[] = [];

  for (const pattern of given.map((one) => one.trim())) {
    if (pattern === '') continue;
    const reason = reasonToRefuse(pattern);
    if (reason !== undefined) refused.push({ pattern, reason });
    else if (!patterns.includes(pattern)) patterns.push(pattern);
  }

  return { patterns, refused };
}

function reasonToRefuse(pattern: string): string | undefined {
  if (pattern.includes('(') || pattern.includes(')')) return 'a deny rule is written as Read(...), so a bracket cannot be part of the path';
  if (CONTROL.test(pattern)) return 'it holds a character that cannot be in a file name';
  if (pattern.length > LONGEST) return `it is longer than ${LONGEST} characters`;
  return undefined;
}
