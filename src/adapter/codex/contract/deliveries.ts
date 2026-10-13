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
  /**
   * The folder a call runs its command in, where the code names one (`2026-10-11-the-rules-where-the-file-is.md` RWB7,
   * Codex 0.162.1): not the session's folder, and not handed to a `PreToolUse` hook, which is told the session's.
   */
  workdir: 'workdir',
  completedHeader: 'Script completed',
  failedHeader: 'Script failed',
} as const;

/**
 * What a failed script's return says of the error that stopped it (§2.15, measured 2026-10-10 over 2,752 cells): Codex's
 * words, then the error's own class and message on one line. A `SyntaxError` is the one class read, and only to ask
 * whether the code ever started (`cell-parse.ts`); 14 cells held one, each `Script failed`.
 */
export const CELL_SCRIPT_ERROR = {
  opens: 'Script error:\n',
  syntaxError: 'SyntaxError: ',
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
 * establishes nothing for a call of more than one command, so the single-object rule costs nothing. *Amended 2026-10-13
 * (`2026-10-13-each-command-its-own-result.md` EC1, XD4e): a cell whose code settled its commands together and returned
 * each result labelled by its place says which belongs to which, and so does one whose commands each emit one part in
 * their order (EC6, EC7) - `PAIRED_CELL`.*
 */
export const CELL_RESULT = {
  /** The key that opens the object, distinct enough to find it inside the text the cell returned. */
  opensWith: '"chunk_id"',
  /** The same key, as an object holds it: what tells a result object from any other a part holds (EC6). */
  chunkId: 'chunk_id',
  exitCode: 'exit_code',
  output: 'output',
} as const;

/**
 * A cell whose code says which part of its return is which command's (`2026-10-13-each-command-its-own-result.md`): one
 * that settles its commands together and returns each one's end labelled by its place (EC1, measured 2026-10-13: 8 of the
 * 31 cells on disk that call `Promise.allSettled`), and one whose commands each emit one part in their order - one after
 * another, or one `forEach` over the array that ran them (EC6, EC7). `Promise.all`, `Promise.allSettled`, `forEach` and
 * the `{ status, value | reason }` of each settled result are JavaScript's own; `text` is the cell's way of handing the
 * model what it emits (§2.8), and `result` the key the agent's code put a settled result under where it did not spread it.
 */
export const PAIRED_CELL = {
  settle: 'Promise.allSettled',
  all: 'Promise.all',
  each: 'forEach',
  emit: 'text',
  serialise: 'JSON.stringify',
  result: 'result',
  status: 'status',
  value: 'value',
  reason: 'reason',
  fulfilled: 'fulfilled',
  rejected: 'rejected',
} as const;

export const FUNCTION_CALL = {
  name: 'name',
  callId: 'call_id',
  arguments: 'arguments',
  output: 'output',
} as const;
