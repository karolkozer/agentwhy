/**
 * Where a conclusion comes from (spec §4.2, `evidence_ref`). A position, never the content at that position, so
 * an evidence reference can be shown in a report without redaction.
 */
export interface EvidenceRef {
  /** The source the record was read from, named by the model rather than by a file path. */
  readonly source: SourceRef;
  /** 1-based position of the record within that source, as read - never a timestamp. */
  readonly record: number;
  /**
   * When the record says its line was written, epoch milliseconds - **for display only**. A line can be earlier than
   * the one before it and agents run in parallel, so nothing is ordered or joined by it (architecture invariant 3);
   * `tests/architecture.test.ts` holds that. Absent where the line carries no time the format adapter can read.
   */
  readonly at?: number;
}

/**
 * The conversation the session is, one subagent's own transcript, or a reviewer's: a thread the runtime started to
 * judge an action, which is no agent in the delegation tree (`2026-09-27-what-codex-wrote.md` X19).
 */
export type SourceRef =
  | { readonly kind: 'main' }
  | { readonly kind: 'agent'; readonly agentId: string }
  | { readonly kind: 'review'; readonly reviewId: string };

export function mainSource(): SourceRef {
  return { kind: 'main' };
}

export function agentSource(agentId: string): SourceRef {
  return { kind: 'agent', agentId };
}

export function reviewSource(reviewId: string): SourceRef {
  return { kind: 'review', reviewId };
}
