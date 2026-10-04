// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { AgentId } from '../agent.ts';
import type { EvidenceRef } from '../evidence.ts';
import type { ToolUseId } from '../event.ts';
import type { SessionModel } from '../session-model.ts';
import { commitsIn, programsIn } from './command-line.ts';
import type { ProtectedAccess } from './protected-access.ts';
import type { TracedValues } from './returns.ts';

/**
 * Where a traced value landed (`specs/2026-09-15-where-the-value-went.md` R7): an agent's own words, of either kind; a
 * file a call put it into; a command line; the prompt of a delegation, which hands it to another agent; or the input of
 * any other call.
 */
export type UseLanding = 'said' | 'reasoning' | 'file' | 'command' | 'delegation' | 'call';

/**
 * The earliest text in the same agent's own record that carried the value before the use (R8): its own protected read,
 * what came back from a delegation it made, the result of a call that reached nothing protected, output its model was
 * handed that no id joins to a call (`delivered`, `2026-09-27-what-codex-wrote.md` X10) - or nothing.
 */
export type UseSource = 'read' | 'returned' | 'unprotected' | 'delivered' | 'none';

export interface ValueUse {
  readonly agentId: AgentId;
  /** The protected files the value was read from. */
  readonly files: readonly string[];
  /** Set when a value was printed by a call that read several protected files at once: it is from one of `files`. */
  readonly fileUncertain?: true;
  readonly landed: UseLanding;
  /** For `file`: the paths the call writes, as it named them, and whether one of them is itself protected. */
  readonly targets?: readonly string[];
  readonly intoProtected?: boolean;
  /** For `command`: the programs it runs, by name, and whether it runs `git commit`. */
  readonly programs?: readonly string[];
  readonly commits?: boolean;
  readonly source: UseSource;
  /** For `unprotected`: the paths the call whose result carried the value named, when it named any. */
  readonly sourceTargets?: readonly string[];
  /** The record of what the use came after, in the same agent's stream; absent for `none` (`2026-09-15-agent-flow.md` R4). */
  readonly sourceRecord?: number;
  /** For `returned`: the delegation whose result, or delivered report, carried the value. */
  readonly sourceDelegationId?: ToolUseId;
  readonly evidence: EvidenceRef;
}

type Landing = Pick<ValueUse, 'landed' | 'targets' | 'intoProtected' | 'programs' | 'commits'>;

interface Source {
  readonly record: number;
  readonly kind: Exclude<UseSource, 'none'>;
  readonly found: ReadonlySet<number>;
  readonly targets: readonly string[];
  readonly delegationId?: ToolUseId;
}

/** On one record, the more direct source is named: a protected read, then a return, then anything else. */
const SOURCE_ORDER: readonly UseSource[] = ['read', 'returned', 'delivered', 'unprotected'];

/**
 * Every use of a traced value (R7, R8): a run of it in an agent's message or in the input of a call, with where it
 * landed and the first thing earlier in that agent's own record stream that carried it. Order is a record's position
 * within one agent's stream: a use is never placed against another agent's records, and never by time. The claim is
 * sameness - the same value appears here - and nothing about how it travelled (R10).
 */
export function valueUses(model: SessionModel, accesses: readonly ProtectedAccess[], traced: TracedValues): ValueUse[] {
  if (traced.values.length === 0) return [];

  const { values, trace } = traced;
  const delegating = new Set(model.delegations.map((delegation) => delegation.id));
  const protectedInputs = new Set(accesses.filter((access) => access.source === 'input').map((access) => access.eventId));
  const sources = sourcesOf(model, accesses, traced);
  const foundIn = (texts: readonly string[]): Set<number> => new Set(texts.flatMap((text) => [...trace.foundIn(text)]));
  const uses: ValueUse[] = [];

  const use = (agentId: AgentId, evidence: EvidenceRef, found: ReadonlySet<number>, landing: Landing): void => {
    if (found.size === 0) return;
    const files = new Set<string>();
    let uncertain = false;
    for (const index of found) {
      const value = values[index];
      if (value === undefined) continue;
      for (const path of value.paths) files.add(path);
      if (value.paths.length > 1) uncertain = true;
    }
    const [first] = (sources.get(agentId) ?? []).filter(
      (source) => source.record < evidence.record && [...found].some((index) => source.found.has(index)),
    );
    uses.push({
      agentId,
      files: [...files].sort(),
      ...(uncertain ? { fileUncertain: true as const } : {}),
      ...landing,
      source: first?.kind ?? 'none',
      ...(first?.kind === 'unprotected' && first.targets.length > 0 ? { sourceTargets: first.targets } : {}),
      ...(first === undefined ? {} : { sourceRecord: first.record }),
      ...(first?.delegationId === undefined ? {} : { sourceDelegationId: first.delegationId }),
      evidence,
    });
  };

  for (const message of model.messages) {
    use(message.agentId, message.evidence, trace.foundIn(message.text), { landed: message.kind });
  }
  // X17: later words to a helper hand a value to it as the first instruction does - once per instruction, where the
  // sender wrote them.
  for (const followUp of model.delegations.flatMap((delegation) => delegation.followUps)) {
    use(followUp.senderAgentId, followUp.evidence, trace.foundIn(followUp.text), { landed: 'delegation' });
  }
  // Words an agent wrote that are no call of the model: code it handed its runtime (X14), and instructions that reached
  // no helper by id (X17). Each says only that the agent put the value into what it sent, never that it ran or arrived.
  for (const context of model.contexts) {
    if (context.author !== 'agent' || context.agentId === undefined) continue;
    if (context.kind !== 'code' && context.kind !== 'unjoined-instruction') continue;
    use(context.agentId, context.evidence, trace.foundIn(context.text), { landed: 'call' });
  }

  for (const event of model.events) {
    if (event.written !== undefined) {
      // What a call puts into a file, never the text an edit takes out: a value only there was in the file already.
      const landing = { landed: 'file' as const, targets: event.targets, intoProtected: protectedInputs.has(event.id) };
      use(event.agentId, event.evidence, foundIn(event.written), landing);
      continue;
    }
    const found = foundIn(stringsIn(event.input));
    if (delegating.has(event.id)) use(event.agentId, event.evidence, found, { landed: 'delegation' });
    else if (event.commands.length > 0) {
      const programs = [...new Set(event.commands.flatMap((command) => programsIn(command)))];
      use(event.agentId, event.evidence, found, { landed: 'command', programs, commits: event.commands.some((command) => commitsIn(command)) });
    } else use(event.agentId, event.evidence, found, { landed: 'call' });
  }

  const order = new Map(model.agents.map((agent, index) => [agent.id, index]));
  const position = (agentId: AgentId): number => order.get(agentId) ?? order.size;
  return uses.sort((first, second) => position(first.agentId) - position(second.agentId) || first.evidence.record - second.evidence.record);
}

/** The texts each agent received that carry a traced value, earliest first. */
function sourcesOf(model: SessionModel, accesses: readonly ProtectedAccess[], { trace }: TracedValues): Map<AgentId, Source[]> {
  const events = new Map(model.events.map((event) => [event.id, event]));
  const delegating = new Set(model.delegations.map((delegation) => delegation.id));
  // A write to a protected file is an access as well, and reads nothing: only a call that returns something reads.
  const reads = new Set(
    accesses
      .filter((access) => access.outcome === 'succeeded' && events.get(access.eventId)?.resultShape !== 'none')
      .map((access) => access.eventId),
  );
  const byAgent = new Map<AgentId, Source[]>();
  const add = (agentId: AgentId, source: Source): void => {
    if (source.found.size === 0) return;
    const list = byAgent.get(agentId);
    if (list === undefined) byAgent.set(agentId, [source]);
    else list.push(source);
  };

  for (const event of model.events) {
    const result = event.result;
    // X10: only output the agent's model was handed carried a value to it. What a process printed, as a runtime
    // recorded it, reached the agent only where it is also in something delivered.
    if (result?.content === undefined || result.stage !== 'model' || delegating.has(event.id)) continue;
    const kind = reads.has(event.id) ? 'read' : 'unprotected';
    add(event.agentId, { record: result.evidence.record, kind, found: trace.foundIn(result.content), targets: event.targets });
  }
  for (const delivery of model.deliveries) {
    if (delivery.status !== 'confirmed') continue;
    // Joined to a call by id, it is that call's output; joined to none, it is delivered output and no more.
    const source = delivery.sourceId === undefined ? undefined : events.get(delivery.sourceId);
    const kind = source !== undefined && reads.has(source.id) ? 'read' : source !== undefined ? 'unprotected' : 'delivered';
    add(delivery.recipientAgentId, { record: delivery.evidence.record, kind, found: trace.foundIn(delivery.text), targets: source?.targets ?? [] });
  }
  // What came back from a delegation is a source for the agent it came back to: its result, unless that is a launch
  // notice, and every report delivered for it (R3).
  for (const delegation of model.delegations) {
    const result = events.get(delegation.id)?.result;
    if (result?.content !== undefined && result.launchNotice !== true) {
      add(delegation.parentAgentId, { record: result.evidence.record, kind: 'returned', found: trace.foundIn(result.content), targets: [], delegationId: delegation.id });
    }
    for (const report of delegation.reports) {
      add(delegation.parentAgentId, { record: report.evidence.record, kind: 'returned', found: trace.foundIn(report.content), targets: [], delegationId: delegation.id });
    }
  }

  for (const list of byAgent.values()) {
    list.sort((first, second) => first.record - second.record || SOURCE_ORDER.indexOf(first.kind) - SOURCE_ORDER.indexOf(second.kind));
  }
  return byAgent;
}

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}
