// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Counts } from '../../../shared/counter.ts';

/**
 * The Codex section of `doctor` (`2026-09-27-what-codex-wrote.md` X26, X24). A closed schema: counts, and labels from the
 * contract's fixed vocabularies. A value the contract does not list is counted as `<unknown>` where it was found and is
 * never printed - not a key, a value, a path, an id or a line of a record.
 */
export interface CodexDoctorReport {
  readonly schemaVersion: 1;
  readonly provider: 'codex';
  readonly contractVersion: number;
  /** The Codex builds the contract was measured on. */
  readonly verifiedAgainst: readonly string[];
  readonly files: {
    /** `rollout-*.jsonl` files found, or 1 for a file given by name. */
    readonly found: number;
    readonly recognised: number;
    /** Files whose first line is not a Codex session's (X2). */
    readonly unknownFormat: number;
    /** Files and folders that could not be read. */
    readonly unreadable: number;
  };
  readonly lines: { readonly total: number; readonly unparsable: number };
  /** By each recognised file's first `session_meta`. */
  readonly versions: Counts;
  readonly historyModes: Counts;
  /** Who started each thread: `person`, `spawned`, `reviewer`, `unknown`. */
  readonly origins: Counts;
  readonly identity: {
    /** Ids a single file owns. */
    readonly uniqueIds: number;
    /** Ids more than one file holds; such an id joins no file (X3). */
    readonly sharedIds: number;
    readonly filesSharingIds: number;
    /** Files whose name holds a UUID other than their first id (X3). */
    readonly fileNameDisagrees: number;
    /** `session_meta` lines after a file's first, which never change its identity. */
    readonly laterMetadata: number;
  };
  readonly tree: {
    readonly roots: number;
    readonly descendants: number;
    /** Files whose parent chain did not resolve, by reason: a missing parent, a shared id, an invalid id, a cycle. */
    readonly unresolved: Counts;
  };
  readonly workingDirectories: {
    /** Files whose `session_meta` and `turn_context` carry more than one `cwd` (X4). */
    readonly filesWithSeveral: number;
    readonly filesWithNone: number;
  };
  readonly order: {
    /** Lines whose `ordinal` is lower than, or equal to, the line before (X12). */
    readonly ordinalBackwards: number;
    readonly ordinalRepeats: number;
  };
  /** Line types (§2.2), `<unknown>` for any other. */
  readonly lineTypes: Counts;
  /** `response_item` payload types. */
  readonly responseItems: Counts;
  /** `event_msg` payload types. */
  readonly events: Counts;
  /** `item_completed` item types (§2.3). */
  readonly items: Counts;
  /** Action item types by status: `CommandExecution completed`, `… <unknown>`. */
  readonly itemStatuses: Counts;
  /** `CommandExecution` commands read as a line (`recognised`) or kept whole (`other`) (X7). */
  readonly commandShapes: Counts;
  /** What a capability record says per file and question: `actions absent`, `own-words supported`, … (X23). */
  readonly capabilities: Counts;
}
