// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * A fork (spec §2.16 CPB36, CP26; 1 fork in the CLI, none in the desktop app): a session folder of its own whose
 * `events.jsonl` opens with its parent's first lines, their ids kept - 60 of 62 byte for byte, `session.start` among the
 * other two, carrying the fork's own `sessionId` - and goes on with its own. The fork's `workspace.yaml` names no parent;
 * the parent's `fork_count` counts it. A line id two files hold is one record, read in the parent.
 *
 * A resumed session is no fork (CPB38): it goes on in its own file, opening the new part with `session.resume`.
 */
export const FORK = { count: 'fork_count' } as const;
