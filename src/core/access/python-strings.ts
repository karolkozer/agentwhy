// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * What in a piece of Python is the text of a string or a comment, and what is code.
 *
 * An AI edits files with Python on standard input: it reads a source file, replaces a piece of its text with another, and
 * writes it back. A path quoted inside that text - `s.replace("a", "read('.env')")` - is a word of the file being written,
 * and the code around it opens no such file (`specs/2026-10-11-a-name-that-is-no-file.md` NX5). Only a reading of the
 * language's own strings tells it from `open('.env')`, whose quoted path is the whole of its string.
 *
 * **Only what is certain is called text.** A reading that is wrong here hides a file the AI read, so wherever the code could
 * make a file's name out of a string's text - it runs or parses text, its string is an f-string, a string is left open -
 * the answer is the cautious one. So it is where a `$` stands in the code itself, which is no Python: the shell rewrites it
 * before Python reads it.
 */

import { placesOfName } from './path-shape.ts';

/** A string's text or a comment, by its place in the code. */
interface Span {
  readonly start: number;
  readonly end: number;
  readonly kind: 'string' | 'formatted' | 'comment';
}

/** Up to two letters before a quote say how Python reads the string: raw, bytes, formatted. */
const OPENS_A_STRING = /[rbuft]{0,2}["']/iy;

/**
 * Names by which code runs text - as code, as a command - or reads data out of it. Where one stands in the code itself, a
 * string's text may become a file's name, so nothing inside its strings is called text.
 */
const READS_TEXT = /\b(?:exec\w*|eval|compile|system|popen\w*|spawn\w*|subprocess|check_output|check_call|getoutput|run|run_\w+|runpy|fork\w*|import_module|__import__|importlib|loads?|parse\w*|literal_eval|safe_load|findall|finditer|shlex|ast|json|yaml)\b/i;

/** What quotes a path inside a string. A bracket does not: `app/(auth)/.env` is a path, whole. */
const QUOTE = /['"`]/;

/** Characters of a word: what a string holds beside a path for its text to be more than the path, quoted twice. */
const WORD = /[\p{L}\p{N}_]/u;

/** How deep strings inside a formatted string's fields are followed. Code that goes deeper is not called text. */
const DEEPEST = 20;

/**
 * Whether every place this Python holds `path` is the text of a longer string - never a string that is that path - or a
 * comment, in code that runs no text and reads no data out of it. False where the code does not hold it.
 */
export function onlyInPythonText(code: string, path: string): boolean {
  const places = placesOfName(code, path);
  const spans = places.length === 0 ? undefined : spansOf(code);
  if (spans === undefined) return false;

  for (const at of places) {
    const around = spans.filter((span) => span.start <= at && span.end >= at + path.length);
    // A formatted string's fields are code, whatever a string in them looks like.
    if (around.length === 0 || around.some((span) => span.kind === 'formatted')) return false;
    if (around.some((span) => span.kind === 'string' && !longerThan(code.slice(span.start, span.end), path))) return false;
  }
  const alone = codeAlone(code, spans);
  return !READS_TEXT.test(alone) && !alone.includes('$');
}

/**
 * A string's text holds more than the path, and is no path that ends in it: something is quoted inside it, among other words,
 * and it goes on past the path. `"Bob's/.env"` is a file `open` may be handed; `"read('.env')"` is none.
 */
function longerThan(text: string, path: string): boolean {
  return QUOTE.test(text) && WORD.test(text.split(path).join('')) && !text.trimEnd().endsWith(path);
}

/** The code without its strings' text and its comments. A formatted string keeps its text: its fields are code. */
function codeAlone(code: string, spans: readonly Span[]): string {
  let kept = '';
  let at = 0;
  for (const span of [...spans].filter((each) => each.kind !== 'formatted').sort((one, other) => one.start - other.start)) {
    if (span.start < at) continue;
    kept += code.slice(at, span.start);
    at = span.end;
  }
  return kept + code.slice(at);
}

/** Every string and comment of the code, or undefined where a string is left open and none can be told from the code. */
function spansOf(code: string): readonly Span[] | undefined {
  const spans: Span[] = [];
  let at = 0;
  while (at < code.length) {
    if (code.charAt(at) === '#') {
      const end = lineEnd(code, at);
      spans.push({ start: at, end, kind: 'comment' });
      at = end;
      continue;
    }
    const opened = openerAt(code, at);
    const next = opened === undefined ? at + 1 : stringEnd(code, opened, spans, 0);
    if (next === undefined) return undefined;
    at = next;
  }
  return spans;
}

interface Opener {
  /** Where the quote stands, past the string's prefix. */
  readonly quoteAt: number;
  readonly formatted: boolean;
}

/** The string that opens here, unless what stands before its quote is the end of a name. */
function openerAt(code: string, at: number): Opener | undefined {
  OPENS_A_STRING.lastIndex = at;
  const opener = OPENS_A_STRING.exec(code)?.[0];
  if (opener === undefined || (opener.length > 1 && WORD.test(code.charAt(at - 1)))) return undefined;
  return { quoteAt: at + opener.length - 1, formatted: /[ft]/i.test(opener) };
}

/** The index past a string's closing quote, the string noted among `spans`; undefined where nothing closes it that this follows. */
function stringEnd(code: string, { quoteAt, formatted }: Opener, spans: Span[], depth: number): number | undefined {
  if (depth > DEEPEST) return undefined;
  const quote = code.charAt(quoteAt);
  const delimiter = code.startsWith(quote.repeat(3), quoteAt) ? quote.repeat(3) : quote;
  const start = quoteAt + delimiter.length;
  let at = start;
  while (at < code.length) {
    if (code.charAt(at) === '\\') {
      at += 2;
    } else if (code.startsWith(delimiter, at)) {
      spans.push({ start, end: at, kind: formatted ? 'formatted' : 'string' });
      return at + delimiter.length;
    } else if (delimiter.length === 1 && code.charAt(at) === '\n') {
      return undefined;
    } else if (formatted && code.charAt(at) === '{') {
      const next = code.charAt(at + 1) === '{' ? at + 2 : fieldEnd(code, at + 1, spans, depth);
      if (next === undefined) return undefined;
      at = next;
    } else {
      at += 1;
    }
  }
  return undefined;
}

/**
 * The index past the `}` closing a formatted string's field. A field is code, and since Python 3.12 the strings in it may
 * use the quote of the string around it: a quote met here never closes that one.
 */
function fieldEnd(code: string, from: number, spans: Span[], depth: number): number | undefined {
  let open = 1;
  let at = from;
  while (at < code.length) {
    const opened = openerAt(code, at);
    if (opened !== undefined) {
      const next = stringEnd(code, opened, spans, depth + 1);
      if (next === undefined) return undefined;
      at = next;
      continue;
    }
    const character = code.charAt(at);
    at += 1;
    if (character === '{') open += 1;
    else if (character === '}') open -= 1;
    if (open === 0) return at;
  }
  return undefined;
}

function lineEnd(code: string, from: number): number {
  const end = code.indexOf('\n', from);
  return end === -1 ? code.length : end;
}
