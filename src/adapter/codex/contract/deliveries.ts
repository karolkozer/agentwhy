// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * What the model is handed (XB5, §2.8). The model writes JavaScript into the `exec` tool; the cell's own output,
 * `custom_tool_call_output.output`, is the one thing of it the model receives - a string, or parts whose text is under
 * `input_text` - and it joins its cell by `call_id` (1,250 of 1,250; 17 of 17). No id joins it to the items the cell's
 * code produced, so what it carries is attributed to no action (X10, X14).
 *
 * A direct call is a `function_call`, joined to its `function_call_output` by `call_id` (88 of 88, §2.3); where an item's
 * `id` equals that `call_id` (59 `McpToolCall` items), the item is the action and the output its delivery.
 */
export const CODE_CELL = {
  tool: 'exec',
  name: 'name',
  code: 'input',
  callId: 'call_id',
  output: 'output',
  partType: 'type',
  partText: 'text',
  textPart: 'input_text',
} as const;

/**
 * What a cell's code ran, read only where the record keeps no action item (XD4, amended 2026-10-05; §2.11): the VS Code
 * panel's records hold none. The code calls `tools.exec_command({ cmd: "…" })`; its return to the model opens with one
 * of two headers (the probe's vocabulary, measured on 0.157.0-0.160.0), which is the script's state and not the
 * command's exit: of 632 cells that recorded both, 138 completed a script whose command exited non-zero. The command's
 * own exit is recorded separately where the cell returned the call's whole result - `CELL_RESULT`, XD4a.
 */
export const CELL_COMMANDS = {
  toolsObject: 'tools',
  call: 'exec_command',
  command: 'cmd',
  completedHeader: 'Script completed',
  failedHeader: 'Script failed',
} as const;

/**
 * The first part of a cell's return, where it is Codex's header and nothing else; what the script emitted follows, one
 * part per text it emitted (XD4c-R4, measured 2026-10-08 over 383 files: of 2,462 returns opening with a header, 2,457
 * held it as a first part of exactly this shape, 1,918 followed it with one part, 539 with more, and 5 were one string).
 * One part after it is the one shape whose text is the script's alone, with no header in it.
 */
export const CELL_HEADER_PART = /^Script (?:completed|failed)\nWall time [\d.]+ seconds\nOutput:\n$/;

/**
 * What one `tools.exec_command` call returned, where the cell's code let the call's whole result be the cell's return
 * (XD4a, measured 2026-10-08; §2.11): a JSON object inside the cell's text, holding the command's own `exit_code`.
 *
 * Whether it is there is decided by the code the model wrote, not by Codex's build: of 185 single-command cells in
 * records that keep no command item, 33 carried it. Of the 147 that did not, 113 read `.output` off the result and
 * returned that string alone, so the exit went nowhere; 38 of 38 that carried it let the result itself be the return.
 * Both shapes were measured on one build, so this is no version's trait and no version is read from it.
 *
 * Read only where the cell holds exactly one such object: a cell that ran several commands holds one each, and which
 * belongs to which is not recorded - pairing them by position would be a guess (L005). `outcomeOfExecution` already
 * establishes nothing for a call of more than one command, so the single-object rule costs nothing.
 */
export const CELL_RESULT = {
  /** The key that opens the object, distinct enough to find it inside the text the cell returned. */
  opensWith: '"chunk_id"',
  exitCode: 'exit_code',
  output: 'output',
} as const;

export const FUNCTION_CALL = {
  name: 'name',
  callId: 'call_id',
  arguments: 'arguments',
  output: 'output',
} as const;
