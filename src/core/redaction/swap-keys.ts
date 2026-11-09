// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { keysInMessage } from './redactor.ts';

/**
 * What a hidden key reads as (`2026-11-05-a-key-in-what-it-read.md` KR4): one fixed text holding no part of the key and no
 * hash of it. KRB3 and KRB9 measured this text; another is measured again, since the AI reads it.
 */
export const KEY_PLACEHOLDER = '[redacted by agentwhy]';

/** What a key's own characters never are. A loose pattern (`npmrc-auth-token`'s `\S+`) runs on into code with them (KRB10). */
const CODE_PUNCTUATION = /[\\()[\]{}'"`,;|^*<>]/;

/** What is left of a value cut off at code, under this, is no key: of `)\S+/g`, nothing. */
const SHORTEST_KEY = 8;

const PRIVATE_KEY = 'private-key';
/** A private key's body, however its lines are joined: in JSON, in JSON inside JSON, in a language's strings. The pattern's own source has none. */
const KEY_BODY = /[A-Za-z0-9+/]{40,}/;

const URL_PASSWORD = 'url-password';
/** A URL's password is any text a URL allows, `*`, `(` and `,` included, so only how it opens says it is a template: `{password}`, `%(password)s`. */
const TEMPLATE_OPENS = /^[{$<%[]/;

/** A value may be written in quotes, escaped ones too, and what the scanner found then opens with one. */
const OPENING_QUOTE = /^\\?["'`]/;

/** Encoded data, whose one long word meets the formats by chance: 9 hits in 400 MB of random base64 (KRB8). */
const ENCODED_DATA = /^[A-Za-z0-9+/=_-]+$/;
const ENCODED_FROM = 1024;

const VALUE_PLACEHOLDER = /(?<=[=:][ \t]*)\[redacted by agentwhy\](?=\s|$)/gm;

const NOTICE_OPENS = 'agentwhy hid ';

/**
 * What the AI is told in the same answer as a swap (KR5). Not optional: without it the AI wrote the placeholder over the real
 * key in 4 of 5 runs of a task that rewrote the file, and with it in 0 of 15 (KRB9). This wording is the one measured.
 */
export function keySwapNotice(count: number): string {
  return `${NOTICE_OPENS}${count} key(s) in this tool's result: each now reads ${KEY_PLACEHOLDER}. The real value is still where it was, and ` +
    'you were not shown it. Do not write the placeholder into a file: a file written from this text would lose the real key, ' +
    'so change such a file around the hidden value. If the work needs the value itself, ask the person.';
}

/** Whether a hook's words to the AI are that notice: what tells a report the placeholder was agentwhy's own (KR6). */
export function isKeySwapNotice(text: string): boolean {
  return text.startsWith(NOTICE_OPENS);
}

/** What opens the notice in Codex, where the swapped result reaches the AI as the hook's words and so as an error. */
const CODEX_NOTICE_OPENS = '[agentwhy: the command ran; this is its output. ';

/**
 * `2026-11-09-codex-hides-keys.md` CH3: what follows a swapped result in Codex, after a blank line - KR5's notice, opened by
 * what Codex's answer leaves out, that the command ran. The probe's `codex-tell`, the wording CHB1 measured.
 */
export function codexKeySwapNotice(count: number): string {
  return `${CODEX_NOTICE_OPENS}${keySwapNotice(count)}]`;
}

/**
 * KR11, CH6: how many keys a text agentwhy swapped holds hidden - its placeholders, less the one each of Codex's notices holds in
 * its own words, since a Codex cell's whole return carries the notice beside the result.
 */
export function keysHiddenIn(text: string): number {
  const placeholders = text.split(KEY_PLACEHOLDER).length - 1;
  const notices = text.split(`${CODEX_NOTICE_OPENS}${NOTICE_OPENS}`).length - 1;
  return Math.max(0, placeholders - notices);
}

/** CH6: whether what Codex handed its AI holds that notice - what tells a report a placeholder in it is agentwhy's own. */
export function holdsCodexKeySwapNotice(text: string): boolean {
  return text.includes(`${CODEX_NOTICE_OPENS}${NOTICE_OPENS}`);
}

export interface SwappedKeys {
  /** The same shape, each key found replaced by the placeholder. */
  readonly value: unknown;
  /** How many were replaced. Never which, never any part of one. */
  readonly count: number;
}

/**
 * A tool's result with each key swapped for the placeholder and everything else as it was (KR3). It asks what the check on
 * a person's message asks (KR2), and leaves out what that check's pattern takes from code, here alone: the shared patterns
 * are what reports and the message check read, and they stay as they are (KRD4). A result with no key comes back the same
 * object, so nothing is answered for it.
 */
export function swapKeys(result: unknown): SwappedKeys {
  let count = 0;
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const { text, swapped } = swapInText(value);
      count += swapped;
      return text;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value === null || typeof value !== 'object' || isImage(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, walk(item)]));
  };
  const value = walk(result);
  return { value: count === 0 ? result : value, count };
}

/**
 * `2026-11-09-codex-hides-keys.md` CH6: the texts `swapKeys` replaces in `text`, for a reader that must know whether any of them
 * reached the model by another way. Compared and dropped, never kept: a raw value never enters the report model.
 */
export function keysSwappedIn(text: string): string[] {
  if (text.length >= ENCODED_FROM && ENCODED_DATA.test(text)) return [];
  return [...keysInMessage(text)].flatMap((key) => {
    if (key.sample) return [];
    const span = keySpan(key.kind, text.slice(key.start, key.end));
    return span === undefined ? [] : [text.slice(key.start + span.from, key.start + span.to)];
  });
}

function swapInText(text: string): { readonly text: string; readonly swapped: number } {
  if (text.length >= ENCODED_FROM && ENCODED_DATA.test(text)) return { text, swapped: 0 };
  let out = text;
  let swapped = 0;
  // From the end, so that each span still stands where the scanner found it.
  for (const key of [...keysInMessage(text)].sort((a, b) => b.start - a.start)) {
    if (key.sample) continue;
    const span = keySpan(key.kind, text.slice(key.start, key.end));
    if (span === undefined) continue;
    out = out.slice(0, key.start + span.from) + KEY_PLACEHOLDER + out.slice(key.start + span.to);
    swapped += 1;
  }
  return { text: out, swapped };
}

/**
 * Which part of what the scanner found is the key. Nothing is ever half hidden and called hidden (KR5), so a private key is whole or
 * nothing, and a URL's password too. A loose pattern's value runs from past an opening quote to the first character no key holds,
 * where that leaves enough to be one. Each is told from code by what it holds, and all of it was measured on real results (KRB10).
 */
function keySpan(kind: string, found: string): { readonly from: number; readonly to: number } | undefined {
  if (kind === PRIVATE_KEY) return KEY_BODY.test(found) ? { from: 0, to: found.length } : undefined;
  if (kind === URL_PASSWORD) return TEMPLATE_OPENS.test(found) ? undefined : { from: 0, to: found.length };
  const from = OPENING_QUOTE.exec(found)?.[0].length ?? 0;
  const at = found.slice(from).search(CODE_PUNCTUATION);
  if (at === -1) return { from, to: found.length };
  return at < SHORTEST_KEY ? undefined : { from, to: from + at };
}

/**
 * A result's text as a report scans it where the record says the placeholder is agentwhy's own (KR6): none of it read as a value. It
 * leaves an empty value where one stood, since a name with nothing after it reads the next line as its value, and nothing inside a URL.
 */
export function withoutKeyPlaceholders(text: string): string {
  return text.replaceAll(VALUE_PLACEHOLDER, '""').replaceAll(KEY_PLACEHOLDER, '');
}

/** `Read`'s and an MCP tool's image, and a shell result marked as one: its data is never text (KRB8). */
function isImage(value: object): boolean {
  const { type, isImage: marked } = value as { readonly type?: unknown; readonly isImage?: unknown };
  return type === 'image' || marked === true;
}
