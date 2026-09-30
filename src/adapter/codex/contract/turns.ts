/**
 * A turn and its boundaries (§2.2): `turn_context` opens one per turn with its `turn_id`; `task_started`,
 * `task_complete` and `turn_aborted` name it by the same id. Every item and response record carries it (§2.2, §2.8).
 */
export const TURN_CONTEXT = {
  turnId: 'turn_id',
  workingDirectory: 'cwd',
} as const;

export const TURN_EVENTS = {
  started: 'task_started',
  complete: 'task_complete',
  aborted: 'turn_aborted',
  turnId: 'turn_id',
  /** On a reviewer's turns: the turn of the agent it reviewed (§2.4, §2.7). */
  rootTurnId: 'root_turn_id',
  /** On `task_complete`: a copy of the turn's final answer, or a reviewer's verdict (§2.4, §2.8). */
  lastMessage: 'last_agent_message',
} as const;

/** Where a response record carries its turn (§2.2): 1 record of all measured lacked it. */
export const RESPONSE_TURN = {
  metadata: 'internal_chat_message_metadata_passthrough',
  turnId: 'turn_id',
} as const;
