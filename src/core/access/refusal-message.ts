// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0

/**
 * The path a shell command would have reached, read back out of `refuse`'s own words
 * (`src/refuse/render/refusal-words.ts` `refusalReason`) - the only place that path survives for a command blocked
 * through a glob or a search, since nothing in the call itself named it (`accesses-of` `AccessSource`, "no
 * parameter named it"). A `PreToolUse` hook's stderr is all Claude Code keeps of why it stopped a call, for every
 * provider this runs under, so this is read here once rather than guessed at per adapter.
 *
 * The three shapes mirror `howItReaches` exactly: `it names <path>`, `<word> expands to <path>`, `this search
 * would read <path>`. `tests/core/access/refusal-message.test.ts` pins this parser against the real function, not
 * a copy of its words, so the two cannot drift apart unnoticed.
 *
 * Found inside the content, never anchored at its start: Claude Code frames a blocking hook's stderr of its own
 * first - `PreToolUse:Bash hook error: [<command the hook ran>] <stderr>` - so the message this looks for never
 * opens the result it sits in (`2026-09-16-a-notice-in-the-conversation.md` D11 measures the same framing for
 * `Stop`). Matched the same way `RULE_REFUSED_READ` already is: a substring, not a whole result.
 *
 * `undefined` for a result that is not this message at all - another hook's refusal, Claude Code's own, an
 * ordinary error - never a guess at what some other text might have meant.
 */
const PREFIX = 'agentwhy refused this command: ';
const PROTECTS = /, which (?:this project's policy|the computer-wide policy) protects \(([^()]*)\)/;
const NAMED = 'it names ';
const SEARCH = 'this search would read ';
const EXPANDS = ' expands to ';

export interface RefusedReach {
  readonly path: string;
  readonly pattern: string;
}

export function refusedReach(content: string): RefusedReach | undefined {
  const start = content.indexOf(PREFIX);
  if (start < 0) return undefined;
  const protects = PROTECTS.exec(content.slice(start));
  if (protects === null) return undefined;
  const pattern = protects[1];
  const reach = content.slice(start + PREFIX.length, start + protects.index);
  const path = pathOf(reach);
  return path === undefined || path === '' || pattern === undefined ? undefined : { path, pattern };
}

function pathOf(reach: string): string | undefined {
  if (reach.startsWith(NAMED)) return reach.slice(NAMED.length);
  if (reach.startsWith(SEARCH)) return reach.slice(SEARCH.length);
  const expands = reach.indexOf(EXPANDS);
  return expands < 0 ? undefined : reach.slice(expands + EXPANDS.length);
}
