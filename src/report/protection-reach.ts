// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Provider } from '../core/session-format.ts';

/**
 * Whether agentwhy's protection reaches an AI's conversations by itself: a block it refuses, and a tracked read it says in
 * the chat (`2026-10-05-what-copilot-wrote.md` CP20). Copilot's reaches only where agentwhy's own check is written in the
 * person's Copilot settings and runs (`2026-10-09-copilot-blocks-too.md` CB10) - a fact read when a page is written
 * (`ReportPage.checkRuns`); unread, a page about a Copilot conversation never promises that a file is kept from it. An AI
 * added to `Provider` does not compile until it is said here.
 */
export const PROTECTION_REACHES: Readonly<Record<Provider, boolean>> = { 'claude-code': true, codex: true, copilot: false };

/**
 * Whether agentwhy tells the person in the chat when an AI reads a file they chose to Track: Claude Code's end of a turn
 * and Codex's Stop hook do; Copilot has no hook of agentwhy's that speaks in the chat (`copilot-blocks-too`, the review of
 * step 4), so a page about a Copilot conversation says a tracked read is seen in the report alone.
 */
export const TRACK_TOLD: Readonly<Record<Provider, boolean>> = { 'claude-code': true, codex: true, copilot: false };
