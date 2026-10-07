// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { AgentId } from './agent.ts';
import type { Completeness, ContentCompleteness } from './completeness.ts';
import type { EvidenceRef } from './evidence.ts';

/** The key that joins a call to its result. Opaque to the core: the adapter knows where it is written. */
export type ToolUseId = string;

/**
 * Access outcome, dimension A of spec §5.1, minus `ATTEMPT`.
 *
 * `ATTEMPT` means "a call against a **protected** resource", and what counts as protected is a policy question,
 * not something a transcript states. It is therefore assigned where the policy is known (M2), on top of these.
 * An unrecognised outcome marker yields `unknown`, never `blocked` - the field is typed, but its vocabulary is
 * undocumented and may grow.
 *
 * `succeeded` means the record establishes that the call reached what it addressed, never only that it ran
 * (`2026-09-27-what-codex-wrote.md` X11): a process status is `ToolEvent.execution`, and an attempt whose effect the
 * record does not establish is `unknown`.
 */
export type EventOutcome = 'succeeded' | 'blocked' | 'unknown';

/**
 * Who refused a blocked call (`specs/2026-10-01-who-stopped-it.md` WS2): a rule somebody wrote, a reviewer that decides
 * call by call - Claude Code's auto mode - or the person, at a prompt. Set by the adapter, which knows the provider's
 * vocabulary; the core never reads a provider's value to decide it. All three are `blocked`: the call did not run.
 */
export type RefusalSource = 'rule' | 'reviewer' | 'person';

/**
 * What a tool's result is, in the model's own terms: an enumeration of what the call reached (`listing`), the
 * content of the one thing it was pointed at (`content`), or neither (`none`). A path found in a listing was
 * touched; a path found in content was mentioned by whatever was read.
 */
export type ResultShape = 'listing' | 'content' | 'none';

/**
 * What a runtime recorded about running a call: whether its process or tool completed, and with which exit code. It says
 * that something ran, **never** what it reached (`2026-09-27-what-codex-wrote.md` X11): a failed `cat .env` ran and read
 * nothing, and a command that exited 0 may have reached none of the files it named. `unrecognised` is a status the
 * contract does not list.
 */
export type ExecutionStatus = 'completed' | 'failed' | 'interrupted' | 'unrecognised';

export interface Execution {
  readonly status: ExecutionStatus;
  readonly exitCode?: number;
}

/**
 * Which stage of a call's output a result is (X10): what the agent's model was handed (`model`), or what the process
 * printed as the runtime recorded it (`execution`), which says nothing about whether any model received it.
 */
export type OutputStage = 'model' | 'execution';

export interface ToolEvent {
  readonly id: ToolUseId;
  readonly agentId: AgentId;
  /**
   * Order within that agent's own record stream, 1-based. Derived from the position of the record, never from a
   * timestamp: with agents running in parallel, time is actively misleading (architecture invariant 3).
   */
  readonly sequence: number;
  readonly toolName: string;
  /**
   * What the agent asked the tool to do, as written. **Raw content**: it carries prompts, commands and paths,
   * so it must not reach any output before the redaction boundary of M3.
   */
  readonly input: Readonly<Record<string, unknown>>;
  /**
   * The strings that say **what this call addressed** - a file path, a command line - as opposed to the text it
   * merely carried. An adapter fills them, because where a tool states its target is a property of that tool.
   * Matching the whole input instead would count a document that mentions a file as a touch of that file.
   */
  readonly targets: readonly string[];
  /**
   * Command lines the call carried. Kept apart from `targets` because they are read differently: a path in a
   * command is one token among many, and a quoted sentence inside it names nothing at all.
   */
  readonly commands: readonly string[];
  /**
   * The absolute folder the call ran in, where the record says (`2026-10-07-a-file-in-its-place.md` IP4): Claude Code's
   * record names it on every line, Codex's command item relative to its turn's. A path a command names is read in it as
   * well as as written, so a rule naming a place meets `cat sub/x` run there. Absent: read as written only.
   */
  readonly workingDirectory?: string;
  /** What the result is, which decides whether a path inside it was reached or only mentioned. */
  readonly resultShape: ResultShape;
  /** False when the adapter did not recognise the tool, so a report can say so rather than imply knowledge. */
  readonly toolKnown: boolean;
  /**
   * For a call that writes a file: the text it puts in, as written - never its path, and never the text an edit takes
   * out, since a value only there was in the file already (`2026-09-15-where-the-value-went.md` R7). **Raw content.**
   * Absent for any other call.
   */
  readonly written?: readonly string[];
  /**
   * The call is a search whose result is the lines it matched, where the tool says so in its input rather than in a
   * command line - the Grep tool's `output_mode: "content"` (`search-hits-are-reads` H1). A shell search is read from
   * `commands` by the core. Absent: nothing said.
   */
  readonly printsMatches?: true;
  readonly outcome: EventOutcome;
  /**
   * The runtime's record of running the call, where the format keeps one apart from its result. Absent where it keeps
   * none (Claude Code), which is no claim either way.
   */
  readonly execution?: Execution;
  /** The turn of its agent the call belongs to, by the turn's own id where the format records one; never inferred. */
  readonly turnId?: string;
  /** Absent when there is no result to point at - which is one of the ways `outcome` becomes `unknown`. */
  readonly result?: EventResult;
  readonly evidence: EvidenceRef;
  readonly completeness: Completeness;
}

export interface EventResult {
  /**
   * The result as written in the record. **Raw content**, under the same rule as `input`.
   *
   * When the output was spilled to a file, this is the notice pointing at that file - **not** the output. A
   * consumer that scans results for evidence must treat a spilled result as content it has not seen, which is
   * what `outcome: 'unknown'` and the `spilled-result-missing` gap say when the file is gone.
   */
  readonly content?: string;
  /** The marker that made this a blocked call, in the provider's vocabulary, when there was one. */
  readonly denialKind?: string;
  /** Who refused it, where the marker is one the adapter knows (WS2). Absent on a call nothing refused. */
  readonly refusedBy?: RefusalSource;
  /**
   * The result says only that the call started work elsewhere. What the work produced is not in it: it arrives later as
   * a delivered report, or not at all (`2026-09-15-where-the-value-went.md` R5).
   */
  readonly launchNotice?: boolean;
  /** Which stage of the output this is. Only `model` is content the calling agent is known to have received. */
  readonly stage: OutputStage;
  /** Whether `content` holds all of that stage (`ContentCompleteness`). */
  readonly completeness: ContentCompleteness;
  readonly evidence: EvidenceRef;
}
