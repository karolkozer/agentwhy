// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { AgentId } from './agent.ts';
import type { ContentCompleteness } from './completeness.ts';
import type { EvidenceRef } from './evidence.ts';
import type { ToolUseId } from './event.ts';

/**
 * What a context record is (`2026-09-27-what-codex-wrote.md` §4.G, X14, X17, X31):
 *
 * - `code` - code an agent wrote for its runtime to run. A value in it was written by the agent; that proves no code ran.
 * - `conversation` - words the agent was given by a person, the runtime or its developer, or a copy of its own words
 *   that joins no message by id. Never the agent's own words.
 * - `unjoined-instruction` - words an agent sent another agent that no id joins to a delegation.
 * - `orphan-output` - tool output that joins no call.
 */
export type ContextKind = 'code' | 'conversation' | 'unjoined-instruction' | 'orphan-output';

/**
 * Who wrote a context record, as far as the record says: the agent whose stream it is in, another agent of the session,
 * a person, the runtime's developer instructions, the runtime itself, a tool, a reviewer - or unknown.
 */
export type ContextAuthor = 'agent' | 'another-agent' | 'person' | 'developer' | 'runtime' | 'tool' | 'reviewer' | 'unknown';

/**
 * Content a session holds that is neither a call, a result nor an agent's own words. It is scanned and redacted like
 * everything else, so a value found only here is still found - it is kept apart only so that it is never mistaken for
 * an action, an utterance or a delivery. **Raw content.**
 */
export interface ContextRecord {
  readonly kind: ContextKind;
  readonly author: ContextAuthor;
  /** The agent whose stream it is in. */
  readonly agentId?: AgentId;
  readonly turnId?: string;
  readonly text: string;
  readonly completeness: ContentCompleteness;
  readonly evidence: EvidenceRef;
}

/** Whether a delivery is established by the record, or only possible. */
export type DeliveryStatus = 'confirmed' | 'unknown';

/**
 * Content an agent's model received that is not the result of one of its calls (X10): the output a runtime handed back
 * from code the agent wrote, for instance. It says the recipient received this text; it names the call the text came
 * from only where a measured id joins them, and never by text, turn or proximity. **Raw content.**
 */
export interface ModelDelivery {
  readonly recipientAgentId: AgentId;
  /** The event whose output this carries, where an id joins them. Absent: attributed to no call. */
  readonly sourceId?: ToolUseId;
  readonly status: DeliveryStatus;
  readonly text: string;
  readonly completeness: ContentCompleteness;
  readonly turnId?: string;
  readonly evidence: EvidenceRef;
}
