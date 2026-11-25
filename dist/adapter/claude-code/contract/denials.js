// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
export const KNOWN_DENIAL_KINDS = ['permission-rule', 'automode-blocked'];
/**
 * Who each known value says refused the call (`specs/2026-10-01-who-stopped-it.md` WS1): a permission rule, or the
 * reviewer - auto mode's classifier. Measured 2026-10-01 (spec §4.0): `automode-blocked` on 5 result lines of Claude
 * Code 2.1.236 and 2.1.284, each a `user` line holding one result marked as an error; two were commands that would have
 * started a server, and none started. A Record over the union: a value added above does not compile until it says who.
 *
 * `user-rejected` - a call the person turned down at a prompt - was seen once and is **not** listed: that such a call
 * does not run has not been measured (WSB1), and a value read as "did not run" without that would be a guess.
 */
export const DENIAL_SOURCE = {
    'permission-rule': 'rule',
    'automode-blocked': 'reviewer',
};
// An unrecognised denial kind must surface as unknown, never be folded into a known one.
export function isKnownDenialKind(value) {
    return typeof value === 'string' && KNOWN_DENIAL_KINDS.includes(value);
}
/**
 * What the Read tool itself answers when a deny rule covers the file. Measured 2026-09-24 on a real session: a Read of
 * `.env` under a deny rule for every `.env` file came back as an error result holding these words, and the record carried no
 * `toolDenialKind` - that marker is written for a shell command a rule refuses, not for this. Without these words the
 * refusal read as a call that failed, and the page said "only saw a name" of a file a rule had kept out. Matched only
 * inside a result marked as an error, so a file that merely quotes the sentence is not a refusal.
 */
export const RULE_REFUSED_READ = 'File is in a directory that is denied by your permission settings.';
/** The kind a refusal recognised by its words is recorded as: the same rule, reached through another tool. */
export const RULE_REFUSED_READ_KIND = 'permission-rule';
/**
 * `2026-11-23-a-write-over-the-key.md` WK7: how a write agentwhy's own check refused opens its result. Claude Code frames a
 * blocking `PreToolUse` hook's stderr with its own words first - `PreToolUse:<tool> hook error: [<command>] <stderr>`, found
 * live for `refuse` (`core/access/refusal-message.ts`) - so the refusal is that frame, for `Write` or `Edit`, opening the result
 * (or opening it inside `<tool_use_error>`), with `PLACEHOLDER_WRITE_OPENS` after it. Anchored, so the same words quoted in a
 * command's output (`Exit code 1` opens it) or in an edit Claude Code refused (`String to replace not found` opens it) are no
 * refusal. Matched only inside a result marked as an error. Its source is a check - agentwhy's, never a rule (`who-stopped-it`).
 */
export const KEY_WRITE_REFUSAL_FRAME = /^\s*(?:<tool_use_error>)?PreToolUse:(?:Write|Edit) hook error: /;
/** The kind such a refusal is recorded as where its line carries no marker: what Claude Code writes for a hook's refusal (RXB5). */
export const KEY_WRITE_REFUSED_KIND = 'permission-rule';
