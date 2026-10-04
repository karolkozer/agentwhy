// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
export type AbsenceReason = 'not-found' | 'wrong-kind' | 'unreadable';

// Absence is a status, not an error: a session that spawned no subagents has no session directory.
export type Presence =
  | { readonly present: true; readonly path: string }
  | { readonly present: false; readonly path: string; readonly reason: AbsenceReason };

export interface SubagentSource {
  readonly fileId: string;
  readonly transcript: Presence;
  readonly meta: Presence;
}

export interface DiscoveredSession {
  readonly contractVersion: number;
  readonly sessionId: string;
  readonly mainTranscript: Presence;
  readonly subagentsDir: Presence;
  readonly subagents: readonly SubagentSource[];
  readonly toolResultsDir: Presence;
  readonly toolResultFiles: readonly string[];
  /** Entries under the session directory that the format contract does not recognise. */
  readonly unrecognised: readonly string[];
}

/** Locates the sources of one session. */
export interface SessionDiscovery {
  /** `input` is a session directory or its `<session-id>.jsonl`. */
  discover(input: string): Promise<DiscoveredSession>;
}
