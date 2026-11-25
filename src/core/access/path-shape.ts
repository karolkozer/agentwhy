// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * What a string lifted out of a command line or a line of output is shaped like.
 *
 * A path found in code an interpreter was handed, or in a line a program printed, is only a path when the whole
 * string is one. `specs/2026-09-15-paths-not-fragments.md` §2 measured what the rest is: on nine sessions,
 * 10 of 61 files reached were a string literal from a `node -e` script, an object written around a path, or
 * a sentence of output that trails off into one. The measured session had none of them, and
 * reached protected files fifteen times through a path with a space in a directory name - which is why the rule
 * here is about punctuation and about which words sit at the ends, and never about whitespace (lesson L011).
 *
 * The shapes are named rather than reduced to a boolean because a measurement counts them, and counts
 * them with this code: what is measured is what extraction enforces (R5).
 */
export type PathShape =
  | 'path'
  | 'path-with-space'
  | 'words-before'
  | 'words-after'
  | 'code-punctuation'
  | 'command-text';

/** Punctuation that belongs to an expression and to no file name on the systems this reads. */
const CODE_PUNCTUATION = /[{}<>,;]|->|=>/;

/** A shell operator standing between words: what a command line holds and a path does not. */
const OPERATOR = /(?:^|\s)(?:&&|\|\||\|)(?:\s|$)/;

/** A word of a path holds a separator, or starts where a path starts. */
function partOfAPath(word: string): boolean {
  return word.includes('/') || word.startsWith('.') || word.startsWith('~');
}

/**
 * A square bracket belongs to a path only inside one segment of it. A framework names directories
 * `app/[locale]/page.tsx` and files `[...slug].env`; a program printing an array writes `[apps/web/.env,`. So a
 * bracket that does not open and close within its own segment is code, and one that does is a name someone chose.
 */
function bracketsPairWithinSegments(text: string): boolean {
  for (const segment of text.split('/')) {
    let depth = 0;
    for (const character of segment) {
      if (character === '[') depth += 1;
      else if (character === ']') depth -= 1;
      if (depth < 0) return false;
    }
    if (depth !== 0) return false;
  }
  return true;
}

/** A character that goes on with a name: `os.environ` and `config.env` hold no name `.env`. */
const GOES_ON = /[\p{L}\p{N}_]/u;

/**
 * Where a text holds a name as a name, and not as a piece of a longer word (`2026-10-11-a-name-that-is-no-file.md` NX5). A
 * folder before it, or a dot and more after it, still counts: what is asked is where the name may stand, never only there.
 */
export function placesOfName(text: string, name: string): readonly number[] {
  const places: number[] = [];
  if (name === '') return places;
  for (let at = text.indexOf(name); at !== -1; at = text.indexOf(name, at + 1)) {
    const before = text.charAt(at - 1);
    const after = text.charAt(at + name.length);
    if (!GOES_ON.test(before) && !GOES_ON.test(after)) places.push(at);
  }
  return places;
}

/** Whether the string carries punctuation of code. A line of output that does names no file (R2). */
export function holdsCodePunctuation(text: string): boolean {
  return CODE_PUNCTUATION.test(text) || !bracketsPairWithinSegments(text);
}

/**
 * The shape, by the first rule that matches: an operator makes it command text, punctuation makes it code, and
 * what is left is read by its words. One word is a path; more are a path only when the first and the last are both
 * part of one - `/Users/someone/Client Name/app/.env` is a path, `check apps/web/.env` is a sentence.
 */
export function pathShape(text: string): PathShape {
  if (OPERATOR.test(text)) return 'command-text';
  if (holdsCodePunctuation(text)) return 'code-punctuation';

  const words = text.trim().split(/\s+/);
  if (words.length === 1) return 'path';
  if (!partOfAPath(words[0] ?? '')) return 'words-before';
  if (!partOfAPath(words[words.length - 1] ?? '')) return 'words-after';
  return 'path-with-space';
}

/** Whether the whole string is a path, space in a directory name and all. */
export function shapedLikePath(text: string): boolean {
  if (text.trim() === '') return false;
  const shape = pathShape(text);
  return shape === 'path' || shape === 'path-with-space';
}
