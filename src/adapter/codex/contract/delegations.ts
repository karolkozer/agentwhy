/**
 * An agent the agent chose to start, and what it said to it later (X15-X18; §2.4). Measured on one delegation only
 * (§2.4, §2.7): every join here is by id and leaves the relation unresolved where it breaks. XB4 remains open, so these
 * joins are read and never advertised as measured beyond that sample.
 */
export const DELEGATION_TOOLS = { spawn: 'spawn_agent', send: 'send_message', followUp: 'followup_task' } as const;

/** `spawn_agent` arguments (a JSON string): `task_name` and `message` (§2.4). */
export const SPAWN_ARGUMENTS = { name: 'task_name', message: 'message' } as const;

/** The `SubAgentActivity` item: `started` answers `spawn_agent`, `interacted` a later call, by `id` = `call_id` (§2.4). */
export const ACTIVITY = {
  type: 'SubAgentActivity',
  kind: 'kind',
  agentThreadId: 'agent_thread_id',
  kinds: { started: 'started', interacted: 'interacted', completed: 'completed' },
} as const;

/** A started agent's own first `session_meta`: `source.subagent.thread_spawn` (§2.4). */
export const THREAD_SPAWN = {
  source: 'source',
  subagent: 'subagent',
  threadSpawn: 'thread_spawn',
  parentId: 'parent_thread_id',
  depth: 'depth',
  agentPath: 'agent_path',
  role: 'agent_role',
} as const;

/**
 * `response_item/agent_message` between agents (§2.4): `author` is an `agent_path` - a name, never an id (X18) - and
 * `content` the words.
 */
export const AGENT_MESSAGE = { author: 'author', recipient: 'recipient', content: 'content' } as const;
