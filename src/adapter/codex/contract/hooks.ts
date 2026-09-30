/**
 * A project's Codex hooks (`specs/2026-09-30-codex-blocks-too.md` CKB4): `<project>/.codex/hooks.json`, in the shape
 * `{"hooks": {"PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "…"}]}]}}`. Measured on 0.159.2:
 * read only in a project Codex trusts, and a hook in it runs only once a person has approved it in Codex (CKB5).
 */
export const PROJECT_HOOKS = {
  directory: '.codex',
  file: 'hooks.json',
  hooks: 'hooks',
  matcher: 'matcher',
  /** An entry's list of commands, under the same key as the file's top-level object. */
  commands: 'hooks',
  type: 'type',
  commandType: 'command',
  command: 'command',
} as const;

/**
 * What a `PreToolUse` hook is handed for a shell command (CKB2), measured on 0.159.2: `hook_event_name` `PreToolUse`,
 * `tool_name` `Bash`, `tool_input` `{"command": "<line>"}` - the line alone, not the rollout's `[shell, flag, line]` - and
 * `cwd`, the session's folder, which can lie below the project (CKB6). The input also holds `model`, `permission_mode`,
 * `session_id`, `tool_use_id`, `transcript_path` and `turn_id`, none of which `refuse` reads. Exit 2 with a reason on
 * standard error refuses the call (CKB3).
 */
export const PRE_TOOL_USE = {
  event: 'PreToolUse',
  fields: {
    event: 'hook_event_name',
    toolName: 'tool_name',
    toolInput: 'tool_input',
    /** Inside `tool_input` for the shell tool. */
    command: 'command',
    cwd: 'cwd',
  },
  /** The shell tool, and the matcher a hook for it is written with. */
  shellTool: 'Bash',
} as const;

/** A completed Codex turn, measured with `codex exec` 0.159.2. Its transcript path can be absent (ephemeral runs). */
export const STOP = {
  event: 'Stop',
  fields: {
    event: 'hook_event_name',
    active: 'stop_hook_active',
    turnId: 'turn_id',
    transcriptPath: 'transcript_path',
  },
} as const;
