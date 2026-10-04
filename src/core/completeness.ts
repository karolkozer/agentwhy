// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { SourceRef } from './evidence.ts';

/**
 * Evidence completeness, spec §5.3. Absence of evidence is a status, not silence (architecture invariant 4): a
 * report built from incomplete data must say so rather than read as a full picture.
 */
export type Completeness = 'complete' | 'partial' | 'unresolved';

/**
 * Whether a text holds everything of what it stands for - a result, a delivered report, a message - independently of
 * whether the action ran and of whether anyone received it (`2026-09-27-what-codex-wrote.md` X10, §4.G). `partial` and
 * `unknown` never support a claim that something was *not* in it; a positive observation in the text still stands.
 * Text length alone never establishes it.
 */
export type ContentCompleteness = 'complete' | 'partial' | 'unknown';

/**
 * The questions a format may or may not answer for a source (`2026-09-27-what-codex-wrote.md` §3, X23): which actions
 * ran, what an action reached, what reached the model, what the agent wrote and thought, whether an action was
 * refused, and which runtime permissions were recorded.
 */
export type CapabilityQuestion =
  | 'actions'
  | 'access'
  | 'output-delivery'
  | 'own-words'
  | 'reasoning'
  | 'refusals'
  | 'permissions';

/** Why something is not `complete`. One reason per thing missing, never a summary. */
export type GapKind =
  /**
   * The main transcript itself is absent or unreadable: nothing can be said about the session at all, which is
   * a different thing from a session with holes in it.
   */
  | 'session-missing'
  /** A source of the session is absent or could not be read. */
  | 'source-missing'
  /** A record could not be parsed - a truncated write, for instance. */
  | 'record-damaged'
  /** A call has no result, so its outcome cannot be read. */
  | 'result-missing'
  /** A result points at a spilled file that is not there. */
  | 'spilled-result-missing'
  /** The outcome marker carries a value this version of the contract does not know. */
  | 'outcome-unrecognised'
  /** Identifiers do not permit a confident join, so the relation stays unresolved (§4.3 rule 6). */
  | 'relation-unresolved'
  /** A text is `partial` or `unknown` (`ContentCompleteness`): what is not in it cannot be said. */
  | 'result-incomplete'
  /** The format records no answer to a question for this source (X23): not missing data, a thing never written. */
  | 'capability-absent'
  /** Whether the format answers a question for this source has not been measured, so no answer is claimed. */
  | 'capability-unmeasured';

export interface Gap {
  readonly kind: GapKind;
  /** The agent the gap belongs to, where one can be named. */
  readonly agentId?: string;
  /** The source the gap was found in, where it is not the agent's own stream - a reviewer's, for instance. */
  readonly source?: SourceRef;
  /** For a capability gap, the question that cannot be answered. */
  readonly question?: CapabilityQuestion;
}

/**
 * A gap that leaves a relation unjoined makes the whole thing `unresolved`; any other gap makes it `partial`.
 * The distinction matters because an unresolved relation means the event gets no outcome at all (§4.3 rule 6),
 * while a partial one means the picture has holes we can name.
 */
export function completenessOf(gaps: readonly Gap[]): Completeness {
  if (gaps.some((gap) => gap.kind === 'relation-unresolved')) return 'unresolved';
  return gaps.length === 0 ? 'complete' : 'partial';
}
