// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Path-glob matching, written out rather than taken from a library or from an experimental Node API, because
 * which paths count as protected is the security decision of this tool: it has to be small enough to read and
 * pinned by its own tests.
 *
 * `**` crosses directory separators, `*` and `?` do not. A pattern is anchored at both ends.
 */
const SPECIAL = /[.+^${}()|[\]\\]/g;

export function globToRegExp(pattern: string): RegExp {
  let source = '';

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] ?? '';
    const next = pattern[index + 1];

    if (character === '*' && next === '*') {
      // `**/` also matches nothing at all, so `**/.env` matches `.env` at the root.
      if (pattern[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index += 1;
      }
      continue;
    }
    // `*` stops at whitespace as well as at a separator. Without that, a sentence mentioning a path matches a
    // path pattern: everything up to the last slash is eaten by `**/`, and `.env*` then happily covers
    // `.env (only the names, no values) ---`. A directory with a space still works, because `**/` may hold one;
    // the cost is a **file name** containing a space, which is the rarer of the two by far.
    if (character === '*') {
      source += '[^/\\s]*';
      continue;
    }
    if (character === '?') {
      source += '[^/\\s]';
      continue;
    }
    source += character.replace(SPECIAL, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

/**
 * The compiled form of each pattern met so far. A policy holds a handful of patterns and they are asked about once
 * per candidate path, so a busy session compiled the same few thousands of times: measured at 566 ms of one run on a
 * record-heavy transcript, spent entirely on rebuilding regular expressions that never differ. The compiled
 * expression carries no `g` flag and no state, so returning the same one twice cannot change an answer.
 */
const COMPILED = new Map<string, RegExp>();

export function matchesGlob(path: string, pattern: string): boolean {
  let compiled = COMPILED.get(pattern);
  if (compiled === undefined) {
    compiled = globToRegExp(pattern);
    COMPILED.set(pattern, compiled);
  }
  return compiled.test(path);
}
