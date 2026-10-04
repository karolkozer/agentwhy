// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * What makes a file a Claude Code transcript by its content (`2026-09-27-what-codex-wrote.md` X2): its first non-blank
 * line is a JSON object with a string `type`, and either a string `sessionId` or a `type` the contract lists.
 *
 * Measured 2026-09-29 over the first lines of 257 main transcripts, printing only fixed labels and counts: a string
 * `type` in 257, a string `sessionId` equal to the file's own name in 257, a `payload` in none; the `type` was one the
 * contract lists in 193 and another in 64 - which is why the id, not the type, carries the rule. The hand-built
 * fixtures carry a listed type and no `sessionId`, and are recognised by the second half. A Codex rollout's first line
 * is `session_meta` with a `payload` and no `sessionId`, so the two rules never both hold.
 */
export const RECOGNITION = {
  lineType: 'type',
  sessionId: 'sessionId',
} as const;
