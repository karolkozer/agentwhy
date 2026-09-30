import type { AgentId } from './agent.ts';
import type { ContentCompleteness } from './completeness.ts';
import type { EvidenceRef } from './evidence.ts';

/**
 * Which words these are: what the agent said, or what it worked out before calling (`specs/2026-09-15-why-this-call.md` R1).
 * They are kept apart because they are read differently - a report is what came back, a thought is not.
 */
export type MessageKind = 'said' | 'reasoning';

/**
 * Which of an agent's said words these are, where the format records it (`2026-09-27-what-codex-wrote.md` X31): words
 * written while working, or the answer that ends a turn. A channel never turns said words into reasoning.
 */
export type MessageChannel = 'commentary' | 'final';

/**
 * What an agent wrote: its own words, as opposed to the calls it made (`specs/2026-09-15-what-came-back.md` R1). A delegated
 * agent's report is one of these before it is the result of the call that started the agent, and spec §5.4 names
 * it as where the leak of the motivating case landed.
 *
 * **Raw content**, under the rule that governs `ToolEvent.input` and `EventResult.content`: it reaches no output
 * before the redaction boundary.
 */
export interface AgentMessage {
  readonly agentId: AgentId;
  readonly kind: MessageKind;
  readonly text: string;
  /** Whether `text` holds all of what the agent wrote here: encrypted or unsupported parts make it `partial`. */
  readonly completeness: ContentCompleteness;
  /** The format's own id for the message, where it records one. Copies join by it, never by equal text (X31). */
  readonly id?: string;
  readonly channel?: MessageChannel;
  /** Where it was written. The record's position is also the message's place among that agent's records. */
  readonly evidence: EvidenceRef;
  /**
   * Other records holding this same message, joined to it by `id`: evidence of one utterance, never a second one. Absent
   * where there are none.
   */
  readonly copies?: readonly EvidenceRef[];
}
