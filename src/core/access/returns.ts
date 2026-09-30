import type { AgentId } from '../agent.ts';
import type { EvidenceRef } from '../evidence.ts';
import type { ToolUseId } from '../event.ts';
import { isOrdinaryShape } from '../redaction/value-shapes.ts';
import type { ProtectedValue } from './protected-values.ts';
import type { ValueTrace } from '../redaction/value-trace.ts';
import type { SessionModel } from '../session-model.ts';
import type { ProtectedAccess } from './protected-access.ts';
import { protectedValues } from './protected-values.ts';

/** What came back from a delegation, strongest first (R7); `unknown` when what came back cannot be read (R9). */
export type ReturnStrength = 'value' | 'path' | 'report' | 'unknown';

export interface DelegationReturn {
  readonly delegationId: ToolUseId;
  /** The delegated agent whose report came back. */
  readonly agentId: AgentId;
  /** The agent it came back to. */
  readonly parentAgentId: AgentId;
  readonly strength: ReturnStrength;
  /**
   * Set when `value` was not read out of the reply but forced by where the value turned up: the agent that
   * delegated holds a value only an agent below this delegation ever read, and a child's one channel to its
   * parent is its reply. Says the crossing happened without claiming the reply itself was read.
   */
  readonly inferred?: true;
  /** For `value`, the protected files a matched value was read from; for `path`, the reached files the report named. */
  readonly paths: readonly string[];
  /**
   * Set when a matched value was printed by a call that named several protected files at once: the files it
   * names are the ones it came from **one of**, and the transcript does not say which. Of the files this
   * statement shows - `paths` for a value that came back, `writtenFrom` otherwise, since a path that came back
   * was read out of the report itself and names its file exactly.
   */
  readonly fileUncertain?: true;
  /**
   * The protected files a traced value in the agent's own messages was read from (R4b). The agent wrote the value;
   * that is not that it came back - the measured session had the whole value in an agent's messages and no
   * run of 6 or more of it in the result that returned. Empty when its messages carry none.
   */
  readonly writtenFrom: readonly string[];
  /** Distinct protected files reached by the agent or by an agent below it: the count R6 states. */
  readonly filesReached: number;
  /**
   * Characters of what came back, for R6: the reports delivered for the delegation when there are any, and its result
   * otherwise (`2026-09-15-where-the-value-went.md` R6) - never what the agent wrote.
   */
  readonly reportLength?: number;
  /**
   * Set on an `unknown` return whose result is a launch notice with no report delivered for it: the agent was started
   * in the background, and what it reported is not in the record (`2026-09-15-where-the-value-went.md` R5).
   */
  readonly awaited?: true;
  /**
   * The record of the text that decided the statement - the result, or a report delivered for it - and of the result,
   * or of the call, when no text decided it.
   */
  readonly evidence: EvidenceRef;
}

/**
 * One statement for each delegation whose agent, or an agent below it, reached a protected file
 * (`specs/2026-09-15-what-came-back.md` R2-R9). What came back is decided by **the result of the delegating call** alone,
 * since that is what entered the context of the agent that delegated; the delegated agent's own messages are read
 * too, and a traced value in them is reported as written (R4b), never as returned. Each hop is its own return (R8),
 * so a nested agent's report is checked where it came back to, not where it went next.
 */
/** The values worth tracing, and the trace of them: built once for a run and read by everything that needs it. */
export interface TracedValues {
  readonly values: readonly ProtectedValue[];
  readonly trace: ValueTrace;
}

export function traceValues(
  model: SessionModel,
  accesses: readonly ProtectedAccess[],
  traceOf: (values: readonly string[]) => ValueTrace,
): TracedValues {
  // Spec §5.2: an ordinary value - a port, a boolean - would make every report that mentions one carry a value back.
  const values = protectedValues(model, accesses).filter((value) => !isOrdinaryShape(value.value));
  return { values, trace: traceOf(values.map((value) => value.value)) };
}

/** Which protected files a traced value in this text was read from. Empty when it carries none. */
export function filesTracedIn(texts: readonly string[], traced: TracedValues): string[] {
  const files = new Set<string>();
  for (const text of texts) {
    for (const index of traced.trace.foundIn(text)) {
      const value = traced.values[index];
      if (value !== undefined) for (const path of value.paths) files.add(path);
    }
  }
  return [...files].sort();
}

export function returnsOf(
  model: SessionModel,
  accesses: readonly ProtectedAccess[],
  traced: TracedValues,
): DelegationReturn[] {
  const { values, trace } = traced;
  const events = new Map(model.events.map((event) => [event.id, event]));

  return model.delegations.flatMap((delegation): DelegationReturn[] => {
    const child = delegation.childAgentId;
    if (child === undefined) return [];

    const below = agentsFrom(model, child);
    // Only a confirmed reach could have given the agent something to return: a refusal did not, and an attempt whose
    // effect the record does not establish is no reach (`2026-09-27-what-codex-wrote.md` X11).
    const reached = accesses.filter((access) => below.has(access.agentId) && access.outcome === 'succeeded');
    // Nothing protected was reached at or below it, so nothing protected could have come back.
    if (reached.length === 0) return [];

    const event = events.get(delegation.id);
    const result = event?.result;
    const readable = event !== undefined && event.outcome !== 'unknown' && result?.content !== undefined;
    // `2026-09-15-where-the-value-went.md` R3: what came back is what the delegating agent received - the result, and
    // every report delivered for it. A launch notice says only that the agent started, so it is not one of them.
    const received: { readonly text: string; readonly evidence: EvidenceRef }[] = [
      ...(readable && result?.content !== undefined && result.launchNotice !== true
        ? [{ text: result.content, evidence: result.evidence }]
        : []),
      ...delegation.reports.map((report) => ({ text: report.content, evidence: report.evidence })),
    ];
    const messages = model.messages.filter((message) => message.agentId === child).map((message) => message.text);
    const reportLength = delegation.reports.length > 0
      ? delegation.reports.reduce((length, report) => length + report.content.length, 0)
      : result?.content?.length;
    const base = {
      delegationId: delegation.id,
      agentId: child,
      parentAgentId: delegation.parentAgentId,
      filesReached: new Set(reached.map((access) => access.path)).size,
      ...(reportLength === undefined ? {} : { reportLength }),
      evidence: event?.result?.evidence ?? event?.evidence ?? delegation.evidence,
    };

    // A value read by a call that printed several protected files at once came from one of them, so the files it
    // was found under are carried with whether they are the one or the several.
    const filesOf = (texts: readonly string[]): { paths: string[]; uncertain: boolean } => {
      const files = new Set<string>();
      let uncertain = false;
      for (const text of texts) {
        for (const index of trace.foundIn(text)) {
          const value = values[index];
          if (value === undefined || !below.has(value.agentId)) continue;
          for (const path of value.paths) files.add(path);
          if (value.paths.length > 1) uncertain = true;
        }
      }
      return { paths: [...files].sort(), uncertain };
    };
    const written = filesOf(messages);
    const writtenFrom = written.paths;
    const shown = (files: { uncertain: boolean }): { fileUncertain?: true } =>
      files.uncertain ? { fileUncertain: true } : {};

    // What was received decides what came back (R2, amended). A statement of a value shows where the value came from,
    // says nothing of what the agent wrote (R4b), and carries the record of the first text that held it. It is made
    // before anything unreadable is weighed: a value that came back is never downgraded (R7).
    const fromReceived = filesOf(received.map((entry) => entry.text));
    if (fromReceived.paths.length > 0) {
      const carrying = received.find((entry) => filesOf([entry.text]).paths.length > 0);
      return [{
        ...base,
        ...(carrying === undefined ? {} : { evidence: carrying.evidence }),
        strength: 'value',
        paths: fromReceived.paths,
        writtenFrom,
        ...shown(fromReceived),
      }];
    }

    // R9: a return that cannot be read is not a clean one, whatever the agent wrote.
    if (!readable) return [{ ...base, strength: 'unknown', paths: [], writtenFrom, ...shown(written) }];
    // where-the-value-went R5: started in the background, and no report delivered - what came back is not in the record.
    if (received.length === 0) return [{ ...base, strength: 'unknown', awaited: true, paths: [], writtenFrom, ...shown(written) }];

    // R5: only a file that was reached below counts. A protected path a report merely mentions is prose.
    const named = [...new Set(reached.map((access) => access.path))].filter((path) =>
      received.some((entry) => namesPath(entry.text, path)),
    );
    if (named.length > 0) {
      const naming = received.find((entry) => named.some((path) => namesPath(entry.text, path)));
      return [{
        ...base,
        ...(naming === undefined ? {} : { evidence: naming.evidence }),
        strength: 'path',
        paths: named.sort(),
        writtenFrom,
        ...shown(written),
      }];
    }

    // Nothing of the file was in what this record holds of the reply. Before that is said as a clean return, the
    // one thing that can contradict it: a value only an agent below this delegation ever read, in the hands of the
    // agent that delegated. A child's one channel to its parent is its reply, so the value crossed here - whatever
    // carried it, and whether or not this version can read that carrier (`when-an-agent-finishes` D9). Saying
    // "nothing came back" over that is the one answer the record rules out.
    const crossed = filesOf(textsOf(model, delegation.parentAgentId, delegation.evidence.record));
    if (crossed.paths.length > 0) {
      return [{ ...base, strength: 'value', inferred: true, paths: crossed.paths, writtenFrom, ...shown(crossed) }];
    }

    const last = received.at(-1);
    return [{ ...base, ...(last === undefined ? {} : { evidence: last.evidence }), strength: 'report', paths: [], writtenFrom, ...shown(written) }];
  });
}

/**
 * Every string an agent wrote after a given record: its own messages, what it put into the calls it made, the later words
 * it gave its helpers, and code or instructions of its own that are no call of the model (X14, X17).
 */
function textsOf(model: SessionModel, agentId: AgentId, after: number): string[] {
  const strings = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value !== null && typeof value === 'object') return Object.values(value).flatMap(strings);
    return [];
  };
  return [
    ...model.messages.filter((message) => message.agentId === agentId && message.evidence.record > after).map((message) => message.text),
    ...model.events.filter((event) => event.agentId === agentId && event.evidence.record > after).flatMap((event) => strings(event.input)),
    ...model.delegations.flatMap((delegation) => delegation.followUps)
      .filter((followUp) => followUp.senderAgentId === agentId && followUp.evidence.record > after)
      .map((followUp) => followUp.text),
    ...model.contexts.filter((context) => context.author === 'agent' && context.agentId === agentId && context.evidence.record > after)
      .map((context) => context.text),
  ];
}

/** The agent and every agent a chain of delegations below it started. */
function agentsFrom(model: SessionModel, agentId: AgentId): Set<AgentId> {
  const below = new Set([agentId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const delegation of model.delegations) {
      const child = delegation.childAgentId;
      if (child !== undefined && below.has(delegation.parentAgentId) && !below.has(child)) {
        below.add(child);
        grew = true;
      }
    }
  }
  return below;
}

/** Whether the text names this path as a whole: `.env` inside `.env.local` is not it, `/abs/apps/web/.env` is. */
export function namesPath(text: string, path: string): boolean {
  for (let at = text.indexOf(path); at !== -1; at = text.indexOf(path, at + 1)) {
    if (!/[\w.-]/.test(text.charAt(at - 1)) && !/[\w./-]/.test(text.charAt(at + path.length))) return true;
  }
  return false;
}
