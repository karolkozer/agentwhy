// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
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

/**
 * A completed Codex turn, measured with `codex exec` 0.159.2. Its transcript path can be absent (ephemeral runs).
 * `session_id`, `cwd` and `last_assistant_message` are documented beside the measured ones (`the-agent-tells-you` D18)
 * and read where present: what `watch` says at the end of a Codex turn (`2026-10-02-codex-says-it-too.md` CX1).
 */
export const STOP = {
  event: 'Stop',
  fields: {
    event: 'hook_event_name',
    active: 'stop_hook_active',
    turnId: 'turn_id',
    transcriptPath: 'transcript_path',
    sessionId: 'session_id',
    workingDirectory: 'cwd',
    lastMessage: 'last_assistant_message',
  },
} as const;

/**
 * The person's own Codex hooks and their approval (`2026-10-02-codex-approves-its-own-hook.md` AOB1, measured
 * 2026-10-02 on 0.159.3 and the VS Code extension's bundled 0.159.2): `~/.codex/hooks.json` has the project file's
 * shape and belongs to Codex's user layer, read in every folder, trusted or not. A hook in it runs only with a matching
 * approval in `~/.codex/config.toml`: a table
 * `[hooks.state."<absolute path of hooks.json>:<event in snake case>:<group index>:<handler index>"]` whose
 * `trusted_hash` equals the entry's current hash. The key is positional: an entry added or removed above another's
 * shifts the keys below it (AOD3).
 */
export const USER_HOOKS = {
  /** Under the home directory, beside the sessions root (`session.ts` CODEX_FOLDER). */
  directory: '.codex',
  file: 'hooks.json',
  config: 'config.toml',
  /** The keys of the table agentwhy reads and writes, under `hooks.state`. */
  trustedHash: 'trusted_hash',
  enabled: 'enabled',
  /**
   * How long Codex waits for agentwhy's check, named in each entry (AOD9): Codex's own default is 600 seconds (AOB8),
   * which a hanging `npx` would hold every command for. Hashed as AOB10 measured.
   */
  timeoutSeconds: 30,
} as const;

/**
 * The hash Codex checks an approval against (AOB1): `sha256:` + SHA-256, hex, over compact JSON with keys sorted at
 * every depth, of `{"event_name": <snake case>, "matcher": <the group's, omitted when none>, "hooks": [entry]}`, where
 * the entry is `{"type": "command", "command": <as written>, "timeout": <600 unless the file names one, and at least
 * 1>, "async": <false unless named>}` - the defaults written in, `statusMessage` only where the file names it, and
 * `commandWindows` never (Codex normalizes it away before hashing). A `Stop` group's matcher is dropped before
 * hashing; `PreToolUse` keeps its own (`matcher_pattern_for_event`). Events in snake case: `PreToolUse` is
 * `pre_tool_use`, `Stop` is `stop`.
 */
export const HOOK_HASH = {
  prefix: 'sha256:',
  defaultTimeout: 600,
  eventKeys: { PreToolUse: 'pre_tool_use', Stop: 'stop' },
  /** The entry fields the hash reads, by the names the file uses. */
  fields: { timeout: 'timeout', async: 'async', statusMessage: 'statusMessage' },
  /** A field Codex hashes on context-emitting events, which the recipe was not measured over (AO2). */
  unmeasured: ['additionalContextLimit'],
} as const;
