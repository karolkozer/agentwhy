// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * `hook.start` and `hook.end`, joined by `hookInvocationId` (spec §2.11, every pair measured). They are no action and no
 * message: a hook's input copies the prompt, the call and its result - the result's copy is `result.content` or the
 * runtime's elision notice (CPB42) - so a value in it is never a second exposure. The CLI writes them only for events a
 * hook is configured for (CPB31); the desktop app wrote seven kinds with none of a project's configured.
 */
export const HOOK = {
  invocationId: 'hookInvocationId',
  hookType: 'hookType',
  input: 'input',
  output: 'output',
} as const;

/**
 * What a `PreToolUse` hook in the person's own `~/.copilot/hooks/` is handed (`copilot-blocks-too` §2, §2a; CPB20, CPB43):
 * Claude Code's shape, its tools by Claude Code's names - `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob` - and a search
 * subagent's by VS Code's (`read_file`, `grep_search`, `file_search`, CPB62). Measured on the CLI 1.0.94 and 1.0.95.
 */
export const PRE_TOOL_USE = {
  event: 'PreToolUse',
  fields: { event: 'hook_event_name', toolName: 'tool_name', toolInput: 'tool_input', cwd: 'cwd' },
  tools: { shell: 'Bash', read: 'Read', write: 'Write', edit: 'Edit', search: 'Grep', listing: 'Glob' },
  /** The keys of `tool_input` that name what a call addresses (§2a c1, c1b, e1). */
  keys: {
    command: 'command',
    /** `Read`, `Write` and `Edit` name their file by `path`; Claude Code's own name for it is read too (CB2). */
    paths: ['path', 'file_path'],
    pattern: 'pattern',
    /** `Grep` names its folders by `paths`, a string (§2a c1b); Claude Code's own name for one, `path`, is read too. */
    searchPaths: ['paths', 'path'],
    glob: 'glob',
  },
} as const;

/**
 * What Copilot's agent in VS Code hands the same hook for its own tools (§2b g5, measured 2026-10-13 with GPT-5 mini):
 * its terminal by `command`, and its edits as a patch in `input`. `read_file` is the search subagent's tool of the CLI
 * too (`TOOLS.readFile`). Other tools VS Code writes with under other models are not measured (CBB20).
 */
export const VS_CODE_TOOLS = {
  terminal: { name: 'run_in_terminal', command: 'command' },
  patch: { name: 'apply_patch', input: 'input' },
} as const;

/**
 * The lines of a patch that name a file (§2b g5: `*** Begin Patch`, `*** Update File: <the file's full path>`,
 * `*** End Patch`): the shape VS Code's `apply_patch` writes, and Codex's. Each names a file the patch writes, removes or
 * moves to.
 */
export const PATCH_FILE_LINES = ['*** Add File: ', '*** Update File: ', '*** Delete File: ', '*** Move to: '] as const;

/**
 * A hook's answer in JSON, exit 0 (CPB44, CB15): `deny` refuses the call and records the reason after the runtime's own
 * words; anything else written - text that is no JSON - lets it run (§2a c3), and so does nothing at all. The CLI and the
 * desktop app read it at the top; VS Code reads it under `hookSpecificOutput`, as Claude Code writes it, and passes over
 * the top-level one (§2b g3, g4) - so a refusal carries both (CB21), which the CLI refuses too (§2b h1).
 */
export const PRE_TOOL_USE_ANSWER = {
  decision: 'permissionDecision',
  reason: 'permissionDecisionReason',
  deny: 'deny',
  /** VS Code's place for the same two fields, beside the event they answer. */
  specific: 'hookSpecificOutput',
  event: 'hookEventName',
} as const;

/**
 * The person's own hook file that agentwhy writes for Copilot (CB9, CPB43): `~/.copilot/hooks/agentwhy.json`, one
 * `PreToolUse` entry and nothing else. The CLI reads it in every folder and the desktop app in its projects (§2a f1); a
 * person's own file beside it runs too, and a deny from either holds (CBB13).
 */
export const USER_HOOKS = {
  folder: ['.copilot', 'hooks'],
  file: 'agentwhy.json',
  keys: { version: 'version', hooks: 'hooks', type: 'type', command: 'command', timeout: 'timeoutSec' },
  version: 1,
  commandType: 'command',
  /** Well over `refuse`'s own time (CB17): a hook past it lets the call run (§2a c6), which is no harm, only no check. */
  timeoutSeconds: 30,
} as const;
