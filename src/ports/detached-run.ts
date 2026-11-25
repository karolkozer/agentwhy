// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0

/** What a run started apart had done when it was last looked at: its exit code and all it printed, or still going. */
export type DetachedAnswer =
  | { readonly ended: true; readonly exitCode: number; readonly output: string }
  | { readonly ended: false };

/**
 * Runs agentwhy again, apart from this process, and waits for it only so long
 * (`2026-11-24-open-agentwhy-from-the-chat.md` RO6): one that takes longer goes on by itself after this process has ended.
 */
export interface DetachedRun {
  /** In `folder`, waited for at most `waitMs`. `undefined` where it could not be started - no such folder, for one. */
  run(args: readonly string[], folder: string, waitMs: number): Promise<DetachedAnswer | undefined>;
}
