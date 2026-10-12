// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isAbsolute } from 'node:path';
import { commandPathCandidates, fileOperandsIn, simpleCommandsIn } from './command-line.ts';
import { hasGlob } from './search-reach.ts';
import { located, placesIn, UNKNOWN_VARIABLE, type ShellPlace } from './shell-place.ts';

/**
 * `2026-10-11-the-rules-where-the-file-is.md` RW3: the whole paths a line's words name - each word the hook reads for a
 * path (`commandPathCandidates`, a printing program's operands), a glob's word up to its first wildcard - read where the
 * line starts and wherever its `cd`s move it (IP3). What the project each lies in is found from (RW2). A word holding a
 * variable nobody here knows names no place, and neither does `~` where the home is not known.
 */
export function placesNamedIn(command: string, place: ShellPlace): readonly string[] {
  const places = placesIn(command, place, simpleCommandsIn(command));
  const named = new Set<string>();
  for (const word of new Set([...commandPathCandidates(command), ...fileOperandsIn([command])])) {
    if (word === '' || word.startsWith('-') || UNKNOWN_VARIABLE.test(word)) continue;
    const fixed = fixedPart(word);
    for (const at of places) {
      const whole = located(fixed, at);
      if (isAbsolute(whole)) named.add(whole);
    }
  }
  return [...named];
}

/** A glob's word up to the part holding its first wildcard - where the shell starts expanding it - or the word itself. */
function fixedPart(word: string): string {
  if (!hasGlob(word)) return word;
  const parts = word.split('/');
  const fixed = parts.slice(0, parts.findIndex((part) => hasGlob(part))).join('/');
  return fixed === '' ? (word.startsWith('/') ? '/' : '.') : fixed;
}
