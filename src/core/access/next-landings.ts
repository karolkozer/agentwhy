// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { AgentId } from '../agent.ts';
import type { SessionModel } from '../session-model.ts';
import type { LandingText, UseLanding } from './uses.ts';

/** Where a file's text could go on from an agent: one of its own landings (R7), or its reply to the agent that asked. */
export type OnwardLanding = UseLanding | 'reply';

/**
 * `2026-10-19-what-it-did-next.md` DN3: every way an agent put anything on after a record of its own stream - its
 * words, a file a call wrote, a command, another call, instructions to another agent - whatever the text holds, and its
 * reply where another agent asked it, which comes last of all. Asked where what it read there cannot be followed (DN1):
 * a way it never took is a certain *No*, and one it took is not known. Placed by the record's position in that agent's
 * own stream, never against another agent's records (invariant 3).
 */
export function nextLandings(model: SessionModel, landings: readonly LandingText[], agentId: AgentId, record: number): OnwardLanding[] {
  const found = new Set<OnwardLanding>();
  for (const landing of landings) {
    if (landing.agentId === agentId && landing.evidence.record > record) found.add(landing.landing.landed);
  }
  if (model.delegations.some((delegation) => delegation.childAgentId === agentId)) found.add('reply');
  return [...found].sort();
}
