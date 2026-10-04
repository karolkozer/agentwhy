// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { CapabilityQuestion, Gap } from './completeness.ts';
import type { SourceRef } from './evidence.ts';

/**
 * Whether a format answers a question for one source (`2026-09-27-what-codex-wrote.md` X23, main spec §13.6): `supported`,
 * `absent` - the format does not record the answer - or `unmeasured` - whether it does has not been established. Declared
 * by the adapter, never implied by the absence of a record.
 */
export type CapabilityState = 'supported' | 'absent' | 'unmeasured';

export interface CapabilityRecord {
  readonly question: CapabilityQuestion;
  readonly state: CapabilityState;
  readonly source: SourceRef;
  /** The agent that source is, where it is one. */
  readonly agentId?: string;
}

/** The gap each unanswered question leaves: absent and unmeasured stay different answers to a reader. */
export function capabilityGaps(records: readonly CapabilityRecord[]): Gap[] {
  return records.flatMap((record): Gap[] =>
    record.state === 'supported'
      ? []
      : [{
          kind: record.state === 'absent' ? 'capability-absent' : 'capability-unmeasured',
          question: record.question,
          source: record.source,
          ...(record.agentId === undefined ? {} : { agentId: record.agentId }),
        }],
  );
}
