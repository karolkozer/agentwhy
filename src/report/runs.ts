// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { ProtectedAccess } from '../core/access/protected-access.ts';
import type { WordsBefore } from '../core/access/words-before.ts';
import type { ToolEvent, ToolUseId } from '../core/event.ts';
import type { Policy } from '../core/policy/policy.ts';
import type { Redacted } from '../core/redaction/redacted.ts';
import type { Redactor } from '../core/redaction/redactor.ts';
import type { SessionModel } from '../core/session-model.ts';
import { reachesOf, type ReachPlace } from './reaches.ts';
import type { AgentRuns, Run, RunFile, RunStep, SessionGraph, WroteBefore } from './report-model.ts';

/** SB4: `ls` of a project prints hundreds of names, and each would be a chip. */
export const RUN_FILES_KEPT = 24;

/** SB6: the most steps of one AI a page lists; the rest are counted. */
export const RUN_STEPS_KEPT = 400;

/** What the builder already knows how to say, handed in so this module needs nothing of it but the words. */
export interface RunWords {
  /** What was written before a run, across the redaction boundary (`wroteBefore`). */
  readonly wrote: (before: WordsBefore | undefined) => WroteBefore;
  /** What a call ran: the tool and its programs (`didOfEvent`). */
  readonly did: (event: ToolEvent) => string;
  /** The programs a shell call ran (`programsOf`). */
  readonly programs: (event: ToolEvent) => readonly string[];
  /** Where in the record the call is (`describeEvidence`), and when, where the view may say (`atOf`). */
  readonly evidence: (event: ToolEvent) => Redacted;
  readonly at: (event: ToolEvent) => { readonly at?: number };
}

/**
 * Every call of every AI, grouped as it was written (`2026-10-11-step-by-step.md` SB1-SB7): the AIs in the page's order -
 * your AI, the helpers by their number, then any the record does not say was given work - and each AI's calls in its own
 * record's order, never against another's (invariant 3).
 */
export function runsOf(
  model: SessionModel,
  accesses: readonly ProtectedAccess[],
  graph: SessionGraph,
  policy: Policy,
  wordsBefore: ReadonlyMap<ToolUseId, WordsBefore>,
  redactor: Redactor,
  words: RunWords,
  where: ReachPlace = {},
): AgentRuns[] {
  const ranked = [graph.main, ...[...graph.agents].sort((a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || a.index - b.index)];
  const told = new Set(policy.protected.filter((entry) => entry.mode === 'tell').map((entry) => entry.pattern));
  const byEvent = new Map<string, ProtectedAccess[]>();
  for (const access of accesses) byEvent.set(access.eventId, [...(byEvent.get(access.eventId) ?? []), access]);
  const delegations = new Map(model.delegations.map((delegation) => [delegation.id, delegation]));
  const indexOf = new Map(model.agents.map((agent, index) => [agent.id, index]));

  return ranked.flatMap((agent): AgentRuns[] => {
    const id = model.agents[agent.index]?.id;
    const events = model.events.filter((event) => event.agentId === id).sort((a, b) => a.sequence - b.sequence);
    if (id === undefined || events.length === 0) return [];

    const kept = events.slice(0, RUN_STEPS_KEPT);
    // SB5: where a path was first printed or named, by the step's place among this AI's kept steps.
    const firstNamed = new Map<string, number>();
    const runs: { before: WordsBefore | undefined; steps: RunStep[] }[] = [];
    kept.forEach((event, place) => {
      const step = stepOf(event, place);
      const before = wordsBefore.get(event.id);
      const last = runs[runs.length - 1];
      // One run is the calls that share one stretch of writing: `wordsBeforeCalls` hands each of them the same words.
      if (last !== undefined && before !== undefined && last.before?.words === before.words) last.steps.push(step);
      else runs.push({ before, steps: [step] });
    });

    const lastRecord = Math.max(...events.map((event) => event.evidence.record));
    const answered = model.messages.some((message) => message.agentId === id && message.kind === 'said' &&
      message.text.trim() !== '' && message.evidence.record > lastRecord);

    return [{
      agentIndex: agent.index,
      runs: runs.map(({ before, steps }): Run => ({ wrote: words.wrote(before), steps })),
      ...(events.length > kept.length ? { stepsLeftOut: events.length - kept.length } : {}),
      ...(answered ? { answered: true as const } : {}),
    }];

    function stepOf(event: ToolEvent, place: number): RunStep {
      const delegation = delegations.get(event.id);
      // A hand-over reaches no file of its own: what the helper reached is in the helper's steps.
      const reaches = delegation === undefined ? reachesOf(event, byEvent.get(event.id) ?? [], policy, where) : [];
      const files = reaches.map(({ path, how, access }): RunFile => {
        const seen = firstNamed.get(path);
        return {
          path: redactor.path(path),
          how,
          ...(access === undefined ? {} : { private: true as const }),
          ...(access !== undefined && told.has(access.pattern) ? { tracked: true as const } : {}),
          ...(seen !== undefined && how !== 'named' ? { seenAt: seen } : {}),
        };
      });
      for (const { path, how } of reaches) if (how === 'named' && !firstNamed.has(path)) firstNamed.set(path, place);
      // Private files first, then the rest in the order the call gave them.
      const ordered = [...files.filter((file) => file.private === true), ...files.filter((file) => file.private !== true)];
      const child = delegation?.childAgentId === undefined ? undefined : indexOf.get(delegation.childAgentId);
      const refusedBy = event.result?.refusedBy;
      const programs = words.programs(event);
      return {
        sequence: event.sequence,
        did: redactor.term(words.did(event)),
        ...(programs.length === 0 ? {} : { programs: programs.map((program) => redactor.term(program)) }),
        toolKnown: event.toolKnown,
        outcome: event.outcome,
        ...(refusedBy === undefined ? {} : { refusedBy }),
        files: ordered.slice(0, RUN_FILES_KEPT),
        ...(ordered.length > RUN_FILES_KEPT ? { filesLeftOut: ordered.length - RUN_FILES_KEPT } : {}),
        ...(delegation === undefined ? {} : {
          gave: {
            ...(child === undefined ? {} : { agentIndex: child }),
            ...(delegation.description === undefined ? {} : { askedTo: redactor.scan(delegation.description) }),
            back: event.outcome === 'succeeded' && event.result?.launchNotice !== true,
          },
        }),
        evidence: words.evidence(event),
        ...words.at(event),
      };
    }
  });
}
