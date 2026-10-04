// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { AgentId } from './agent.ts';
import type { Completeness } from './completeness.ts';
import type { EvidenceRef } from './evidence.ts';
import type { ToolUseId } from './event.ts';

/**
 * One agent handing work to another - the unit of analysis of this project (spec §2). The cause lives here, in
 * the prompt; the effects live in the events of the agent it started.
 */
export interface Delegation {
  /** The id of the call that started it, which is also what joins it to the agent it spawned. */
  readonly id: ToolUseId;
  readonly parentAgentId: AgentId;
  /** The agent this delegation started. Absent when its transcript is missing - the delegation still exists. */
  readonly childAgentId?: AgentId;
  /** The kind of agent the delegation asked for, read from the delegation index rather than inferred. */
  readonly requestedType?: string;
  /**
   * Nesting depth, **read** from the delegation index (§4.3 rule 4). Absent when there is no index entry: the
   * parent's depth plus one would be a guess, and a guess is what this project exists to avoid.
   */
  readonly depth?: number;
  /**
   * The instruction given to the delegated agent. **Raw content**, and the most sensitive field in the model:
   * this is the sentence a report exists to quote, so it passes the redaction boundary of M3 before any output.
   * Absent only when the record that carried it could not be read.
   */
  readonly prompt?: string;
  readonly description?: string;
  /**
   * Reports delivered for this delegation after its call had a result, in the order read. With the result, they are
   * what came back to the agent that delegated (`2026-09-15-where-the-value-went.md` R3). Empty for an agent that
   * reported in its result.
   */
  readonly reports: readonly DeliveredReport[];
  /**
   * Further instructions the delegating agent gave the same agent later, in the order read
   * (`2026-09-27-what-codex-wrote.md` X17, XD6): one agent stays one delegation, however often it was told more. Empty
   * where the format records none.
   */
  readonly followUps: readonly FollowUp[];
  readonly evidence: EvidenceRef;
  readonly completeness: Completeness;
}

/**
 * Words given to a delegated agent after the delegation that started it, joined to that agent by id. **Raw content**,
 * under the rule that governs `prompt`: a value in them left the agent that wrote them.
 */
export interface FollowUp {
  /** The id of the call that carried them. */
  readonly id: ToolUseId;
  readonly senderAgentId: AgentId;
  readonly text: string;
  /** In the sender's own stream: that is where the words were written. */
  readonly evidence: EvidenceRef;
}

export interface DeliveredReport {
  /** Raw content, under the rule that governs a result. */
  readonly content: string;
  readonly evidence: EvidenceRef;
}
