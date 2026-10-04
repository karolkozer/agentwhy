// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Agent } from './agent.ts';
import type { CapabilityRecord } from './capability.ts';
import type { ContentCompleteness, Gap } from './completeness.ts';
import type { ContextRecord, ModelDelivery } from './context.ts';
import type { EvidenceRef } from './evidence.ts';
import type { Execution, OutputStage, RefusalSource, ResultShape, ToolUseId } from './event.ts';
import type { AgentMessage } from './message.ts';
import type { Review } from './review.ts';
import type { Provider } from './session-format.ts';
import type { Turn } from './turn.ts';

/**
 * What an adapter hands the core: the pieces of a session, already in the core's own terms but **not yet
 * joined**. Correlation is the core's job (spec §9), so an adapter never decides which result belongs to which
 * call - it only reports what it read and where.
 */
export interface SessionRecords {
  readonly sessionId: string;
  /** The AI whose format the records were read from. */
  readonly provider: Provider;
  readonly agents: readonly Agent[];
  readonly calls: readonly CallRecord[];
  readonly results: readonly ResultRecord[];
  /** The calls that handed work to another agent, with what they asked for. */
  readonly delegations: readonly DelegationCall[];
  /** The provider's index of delegated agents, read as found. The core joins it to the calls above. */
  readonly delegationIndex: readonly DelegationIndexEntry[];
  /** Later words to a delegated agent, each with the call that carried them (`2026-09-27-what-codex-wrote.md` X17). */
  readonly followUps: readonly FollowUpCall[];
  /** Which agent each of those calls reached, as the provider recorded it. The core joins it to a delegation. */
  readonly followUpIndex: readonly FollowUpIndexEntry[];
  /** What each agent wrote, in the order read. Nothing to join: the source it was read from names the agent. */
  readonly messages: readonly AgentMessage[];
  /**
   * Reports delivered after the call they answer had its result, each naming that call, as read. Whether the call is a
   * delegation - and so whether the report is part of what came back - is the core's join.
   */
  readonly deliveredReports: readonly DeliveredReportRecord[];
  /**
   * Reports one agent delivered to another, naming the agents rather than a call (`2026-09-27-what-codex-wrote.md` X18).
   * The core joins each to the one delegation between them.
   */
  readonly agentReports: readonly AgentReportRecord[];
  /**
   * The working directories the records carried, as read and without duplicates. The adapter reports them; which
   * of them is the project root, if any, is the core's decision (`project-root.ts`).
   */
  readonly workingDirectories: readonly string[];
  /** Each agent's turns, as recorded; the core checks that `(agentId, id)` names one turn. */
  readonly turns: readonly Turn[];
  /**
   * What reviewers decided, each verdict naming the reviewed turn as its record does. The core keeps a turn only where
   * it is a turn of the reviewed agent (X20).
   */
  readonly reviews: readonly Review[];
  readonly contexts: readonly ContextRecord[];
  readonly deliveries: readonly ModelDelivery[];
  /** The questions the format answers, per source, as the adapter declares them (X23). */
  readonly capabilities: readonly CapabilityRecord[];
  /** What the adapter could not read at all: a missing source, a damaged record. */
  readonly gaps: readonly Gap[];
}

export interface CallRecord {
  readonly id: ToolUseId;
  readonly agentId: string;
  readonly sequence: number;
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
  /** The strings that name what the call addressed; see `ToolEvent.targets`. */
  readonly targets: readonly string[];
  readonly commands: readonly string[];
  readonly resultShape: ResultShape;
  readonly toolKnown: boolean;
  /** See `ToolEvent.written`. */
  readonly written?: readonly string[];
  /**
   * The call is a search whose result is the lines it matched, where the tool says so in its input rather than in a
   * command line - the Grep tool's `output_mode: "content"` (`search-hits-are-reads` H1). A shell search is read from
   * `commands` by the core. Absent: nothing said.
   */
  readonly printsMatches?: true;
  readonly turnId?: string;

  readonly evidence: EvidenceRef;
}

export interface ResultRecord {
  /** The call this result answers, as written in the record. The core checks that such a call exists. */
  readonly callId: ToolUseId;
  readonly content?: string;
  readonly denial?: DenialMarker;
  /** The result points at a spilled file that is not there, so its content cannot be established. */
  readonly spilledResultMissing?: boolean;
  /**
   * The record this result came from carried an outcome marker that could not be attributed to one call. The
   * outcome of this event is therefore not established, however complete the result itself looks.
   */
  readonly attributionAmbiguous?: boolean;
  /** The result says only that the call started work elsewhere; see `EventResult.launchNotice`. */
  readonly launchNotice?: boolean;
  /** The runtime's record of running the call, where the format keeps one; see `ToolEvent.execution`. */
  readonly execution?: Execution;
  readonly stage: OutputStage;
  readonly completeness: ContentCompleteness;
  readonly evidence: EvidenceRef;
}

/** A report that reached an agent after the call it answers had a result (`2026-09-15-where-the-value-went.md` R1). */
export interface DeliveredReportRecord {
  /** The call it names, as written. The core checks what that call is. */
  readonly callId: ToolUseId;
  /** Raw content, under the rule that governs a result. */
  readonly content: string;
  readonly evidence: EvidenceRef;
}

/** A report delivered from one agent to another, by the agents' ids. Raw content, under the rule that governs a result. */
export interface AgentReportRecord {
  readonly fromAgentId: string;
  readonly recipientAgentId: string;
  readonly content: string;
  /** In the recipient's stream: that is where it arrived. */
  readonly evidence: EvidenceRef;
}

/**
 * A marker saying the call was refused. Whether the provider's vocabulary is known is the **adapter's** call -
 * it owns the format contract - while what an unknown value means for the outcome is the core's.
 */
export type DenialMarker =
  /** `source`: who the marker says refused the call (WS2) - required, so an adapter cannot leave it to read as a rule's. */
  | { readonly kind: string; readonly recognised: true; readonly source: RefusalSource }
  | { readonly kind: string; readonly recognised: false };

export interface DelegationCall {
  readonly callId: ToolUseId;
  readonly parentAgentId: string;
  readonly prompt?: string;
  readonly description?: string;
  readonly evidence: EvidenceRef;
}

/**
 * One entry of the delegation index: which agent a call started, and at what depth. Depth is read here and
 * never reconstructed from the tree (§4.3 rule 4) - an entry that does not state it leaves it absent.
 */
export interface DelegationIndexEntry {
  readonly callId: ToolUseId;
  readonly agentId: string;
  readonly requestedType?: string;
  readonly depth?: number;
  /**
   * The agent the started agent's own record names as its parent, where it names one (X16). When it is not the agent
   * that made the call, the relation contradicts itself and stays unresolved.
   */
  readonly recordedParentAgentId?: string;
}

/** A call that gave a delegated agent further words (X17). The words are raw content. */
export interface FollowUpCall {
  readonly callId: ToolUseId;
  readonly senderAgentId: string;
  readonly text: string;
  readonly evidence: EvidenceRef;
}

/** Which agent a follow-up call reached, by the id of the call, as the provider recorded it. */
export interface FollowUpIndexEntry {
  readonly callId: ToolUseId;
  readonly agentId: string;
}
