// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { AgentId } from '../agent.ts';
import type { ToolUseId } from '../event.ts';
import type { AgentMessage } from '../message.ts';
import type { SessionModel } from '../session-model.ts';

/**
 * What an agent wrote before a call, and how many calls those same words stand before
 * (`specs/2026-09-15-why-this-call.md` R2, R3, R4).
 */
export interface WordsBefore {
  /** Everything the agent wrote since its previous call, in the order written; empty when it wrote nothing. */
  readonly words: readonly AgentMessage[];
  /**
   * How many calls follow these words with nothing written between them. One block before four calls was measured
   * 10 times on the measured session, so saying "this is why it ran that" of the fourth would be an invention.
   */
  readonly covers: number;
}

/**
 * The words before every call of every agent.
 *
 * A block belongs to the **run** of calls that follows it, not to the first of them: measured on one
 * session, one block stands before 1 call in 136 runs, 2 in 76, 3 in 15 and 4 in 10. A call that follows another
 * call directly has no words of its own - 186 of 462 - and that is reported as the absence it is, never filled in
 * from the run before.
 *
 * Order is the record's, which is the order the transcript was written in; nothing here is joined by time.
 */
export function wordsBeforeCalls(model: SessionModel): Map<ToolUseId, WordsBefore> {
  const before = new Map<ToolUseId, WordsBefore>();

  for (const agentId of new Set(model.events.map((event) => event.agentId))) {
    for (const run of runsOf(model, agentId)) {
      for (const call of run.calls) before.set(call, { words: run.words, covers: run.calls.length });
    }
  }
  return before;
}

interface Run {
  readonly words: readonly AgentMessage[];
  readonly calls: readonly ToolUseId[];
}

/** One agent's records in order: each stretch of writing, and the calls that follow it before it writes again. */
function runsOf(model: SessionModel, agentId: AgentId): Run[] {
  const calls = model.events
    .filter((event) => event.agentId === agentId)
    .map((event) => ({ at: event.evidence.record, id: event.id }));
  const written = model.messages.filter((message) => message.agentId === agentId);
  // A call and a message never share a record - measured, 149 of 149 text blocks and 249 of 249 reasoning blocks
  // sit on lines of their own - so the record alone orders them.
  const items = [
    ...written.map((message) => ({ at: message.evidence.record, message })),
    ...calls.map((call) => ({ at: call.at, call: call.id })),
  ].sort((first, second) => first.at - second.at);

  const runs: Run[] = [];
  let words: AgentMessage[] = [];
  let following: ToolUseId[] = [];

  for (const item of items) {
    if ('message' in item) {
      // Writing after a run closes it: what comes next stands before the calls that come next.
      if (following.length > 0) {
        runs.push({ words, calls: following });
        words = [];
        following = [];
      }
      words.push(item.message);
      continue;
    }
    following.push(item.call);
  }
  if (following.length > 0) runs.push({ words, calls: following });

  return runs;
}
