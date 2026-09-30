/**
 * What an agent's code did, as `event_msg/item_completed` records it: one typed item per action, joined to its turn by
 * `turn_id` and to its agent by `thread_id` in every measured item (§2.3, 2,344 items; §2.8, 33). An item holds both what
 * was asked and what came back, so no join between a call and its result is made (X6). No id joins an item to the
 * `exec` cell that ran it (§2.3, §2.8): an item is attributed to its turn and agent, never to a cell (X14).
 */
export const ITEM_EVENT = {
  type: 'item_completed',
  turnId: 'turn_id',
  threadId: 'thread_id',
  item: 'item',
} as const;

export const ITEM = {
  type: 'type',
  id: 'id',
  status: 'status',
} as const;

/**
 * `status` values: `completed` and `failed` (§2.3, every action item type; §2.8). An item recorded without one is
 * recorded as completed by its event, `item_completed` - measured on `ImageView`, the one such action item (§2.8).
 */
export const ITEM_STATUSES = { completed: 'completed', failed: 'failed' } as const;

/** Action items the contract names (X6). `Extension` and `ImageView` are named and have no profile: unknown tools. */
export const ACTION_ITEMS = {
  command: 'CommandExecution',
  fileChange: 'FileChange',
  mcp: 'McpToolCall',
  webSearch: 'WebSearch',
  extension: 'Extension',
  imageView: 'ImageView',
} as const;

/**
 * `CommandExecution` (§2.3, 206; §2.8, 8): `command` is `[shell, flag, line]` in all of them; `aggregated_output` is what
 * the process printed, `stdout` included and `stderr` empty in every measured item. Recording it is not delivering it
 * (X10): the model is handed only what the cell emits (§2.8).
 */
export const COMMAND = {
  command: 'command',
  workingDirectory: 'cwd',
  exitCode: 'exit_code',
  output: 'aggregated_output',
} as const;

/** X7: `zsh` measured (206 of 206; 8 of 8); `bash` and `sh` expected and listed by the specification (XB8). */
export const SHELLS = ['zsh', 'bash', 'sh'] as const;
/** `-lc` measured in every item; `-c` listed by X7. */
export const SHELL_FLAGS = ['-lc', '-c'] as const;

/**
 * Codex's own words where it cut the middle out of a recorded output (XB5, §2.8: 1 of 8, at 1,048,606 characters).
 * Present, the output is `partial`. Absent, it is still not taken to be whole: one build at one cap was measured.
 */
export const OMISSION_NOTICE = /\.\.\. \d+ bytes omitted \.\.\./;

/**
 * `FileChange` (§2.3, 221; §2.8, 1): `changes` keyed by path, each with `type` `add` (and `content`), `update` (and
 * `unified_diff`) or `delete`, and an optional `move_path`.
 */
export const FILE_CHANGE = {
  changes: 'changes',
  kind: 'type',
  content: 'content',
  diff: 'unified_diff',
  movePath: 'move_path',
} as const;

export const CHANGE_KINDS = { add: 'add', update: 'update', delete: 'delete' } as const;

/** `McpToolCall` (§2.3, 121): its result's text fields are not measured, so its output is read as raw text of unknown completeness. */
export const MCP = { server: 'server', tool: 'tool', arguments: 'arguments', result: 'result' } as const;

/** `WebSearch` (§2.3, 59): `results[]` fields are not measured (X10); the action is kept as raw input. */
export const WEB_SEARCH = { action: 'action', results: 'results' } as const;

/** `ImageView` (§2.8, 1): the image it opened. Written only when the view succeeded; a failed view writes no item. */
export const IMAGE_VIEW = { path: 'path' } as const;
