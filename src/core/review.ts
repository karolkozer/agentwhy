import type { AgentId } from './agent.ts';
import type { EvidenceRef } from './evidence.ts';

/**
 * A reviewer the runtime started on its own to judge an agent's action, as opposed to an agent the agent chose to start
 * (`2026-09-27-what-codex-wrote.md` X19, X20, XD3). It is no agent of the delegation tree and no delegation. What it
 * decided belongs to a turn of the agent it reviewed, never to a call: nothing records which action it judged.
 */
export interface Review {
  /** The reviewer's own thread; its records are under a `review` source of this id. */
  readonly id: string;
  /** The agent it reviewed, where its record names one this session holds. */
  readonly reviewedAgentId?: AgentId;
  readonly verdicts: readonly ReviewVerdict[];
  readonly evidence: EvidenceRef;
}

/**
 * `allowed` is the one decision measured. Any other is `unrecognised` and is never read as a refusal: what a reviewer's
 * refusal looks like has not been seen (XB1).
 */
export type ReviewOutcome = 'allowed' | 'unrecognised';

export interface ReviewVerdict {
  readonly outcome: ReviewOutcome;
  /** The turn of the reviewed agent this decision was about, joined by id; absent where missing or contradictory. */
  readonly turnId?: string;
  /** The reviewer's own grading, in its recorded words. */
  readonly risk?: string;
  /** The reviewer's reasons. **Raw content** under the redaction boundary, never a trusted status. */
  readonly rationale?: string;
  readonly evidence: EvidenceRef;
}
