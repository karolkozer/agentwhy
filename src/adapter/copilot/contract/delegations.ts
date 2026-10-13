// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * An agent the agent started (spec §2.10 CPB17, §2.16 CPB39; CP11, CP28). The `task` call is followed by
 * `subagent.started`, whose `data.toolCallId` is that call's id (3 of 3) and whose top-level `agentId` names the subagent.
 * Every call the subagent made carries that `agentId` and `data.parentToolCallId` equal to the `task` call (17 of 17), in
 * the same file, and so do its hooks. `subagent.completed` closes it. Two subagents at once joined alike; a subagent's own
 * subagent is not measured.
 */
export const SUBAGENT = {
  agentId: 'agentId',
  callId: 'toolCallId',
  agentName: 'agentName',
  agentType: 'agentType',
} as const;

/**
 * What a `task` call's result is (CPB53): a `sync` task's is the subagent's work; a `background` one's opens with the
 * runtime's launch notice, and the work comes back through `read_agent` (CPB54). Told by the result's own words, as the
 * notice was 2 of 2 and the mode said the same each time.
 */
export const LAUNCH_NOTICE = 'Agent started in background';

/** A background agent's end, said to its parent (CPB55): `data.kind.type` and the agent it names. */
export const NOTIFICATION = { kind: 'kind', type: 'type', agentEnded: 'agent_idle', agentId: 'agentId' } as const;
