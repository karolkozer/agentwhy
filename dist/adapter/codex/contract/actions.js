// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
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
};
export const ITEM = {
    type: 'type',
    id: 'id',
    status: 'status',
};
/**
 * `status` values: `completed` and `failed` (§2.3, every action item type; §2.8). An item recorded without one is
 * recorded as completed by its event, `item_completed` - measured on `ImageView`, the one such action item (§2.8).
 */
export const ITEM_STATUSES = { completed: 'completed', failed: 'failed' };
/** Action items the contract names (X6). `Extension` and `ImageView` are named and have no profile: unknown tools. */
export const ACTION_ITEMS = {
    command: 'CommandExecution',
    fileChange: 'FileChange',
    mcp: 'McpToolCall',
    webSearch: 'WebSearch',
    extension: 'Extension',
    imageView: 'ImageView',
};
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
};
/** X7: `zsh` measured (206 of 206; 8 of 8); `bash` and `sh` expected and listed by the specification (XB8). */
export const SHELLS = ['zsh', 'bash', 'sh'];
/** `-lc` measured in every item; `-c` listed by X7. */
export const SHELL_FLAGS = ['-lc', '-c'];
/**
 * `2026-10-12-powershell-on-windows.md` PW11 (PWB7; XB8 for Windows): Codex on Windows records a command as
 * `[<folder>\pwsh.exe, -Command, <line>]` - 6 of 6 items, the desktop app's 0.162.0 - and the line is PowerShell's. A
 * program is named by its file name without `.exe`, in any case, as Windows names files. `powershell`, Windows
 * PowerShell, is expected where PowerShell 7 is absent (PW9's order) and not measured.
 */
export const POWERSHELLS = ['pwsh', 'powershell'];
/** `-Command` measured in every Windows item; no other flag of PowerShell's is read. */
export const POWERSHELL_FLAG = '-Command';
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
};
export const CHANGE_KINDS = { add: 'add', update: 'update', delete: 'delete' };
/** `McpToolCall` (§2.3, 121): its result's text fields are not measured, so its output is read as raw text of unknown completeness. */
export const MCP = { server: 'server', tool: 'tool', arguments: 'arguments', result: 'result' };
/**
 * agentwhy's own tool, known by what it alone puts in a result (`2026-11-24-talking-about-agentwhy.md` CV18, measured on 0.169.0): the
 * data its card is drawn from, which the item records and the model is not handed. The words are one text block.
 */
export const OWN_RESULT = { tool: 'what_happened', content: 'content', meta: '_meta', answer: 'agentwhy/answer', structured: 'structuredContent', type: 'type', textType: 'text', text: 'text' };
/** `WebSearch` (§2.3, 59): `results[]` fields are not measured (X10); the action is kept as raw input. */
export const WEB_SEARCH = { action: 'action', results: 'results' };
/** `ImageView` (§2.8, 1): the image it opened. Written only when the view succeeded; a failed view writes no item. */
export const IMAGE_VIEW = { path: 'path' };
