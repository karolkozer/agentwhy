// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Pulls path-like tokens out of a piece of text, so they can be held against the policy.
 *
 * The separators are the reason this file exists. A path rarely sits alone: it arrives inside a command
 * (`grep -rn SECRET apps/web`), inside a quoted argument, or inside a line of output that reads
 * `apps/web/.env.development:12:SECRET=…`. Splitting on whitespace alone would leave that whole line as one
 * token and no pattern would ever match it - which is exactly the shape the motivating case took.
 *
 * **Known limits, deliberately not guessed around:** a path assembled at runtime (`$HOME/.ssh/id_rsa`,
 * `"$dir"/.env`) is not recognised as the file it names, and a token that merely looks like a path is offered
 * to the policy like any other. The error runs toward reporting rather than passing over, and every fact says
 * where it was found so a reader can judge it.
 */
const SEPARATORS = /[\s"'`,;:=()<>|{}[\]]+/;

export function pathTokens(text: string): string[] {
  return text
    .split(SEPARATORS)
    .filter((token) => token !== '')
    .map(stripTrailingPunctuation)
    .filter((token) => token !== '');
}

// Prose puts a full stop after a path. A trailing slash is kept: a directory pattern such as the one for
// `secrets` matches the form with the separator and not the bare name, so stripping it lost every call that
// addressed a protected directory as a whole.
function stripTrailingPunctuation(token: string): string {
  return token.replace(/[.]+$/, '');
}

/** Every string inside a value, however deeply it sits. Tool inputs are shaped by the tool, not by us. */
export function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}
