/**
 * What a Claude Code hook is handed and what it may hand back (`specs/2026-09-16-when-an-agent-finishes.md` §2).
 *
 * Read from the hooks reference on 2026-09-16, and **measured the same day** (B4, spec §3.1): on 4 of 4 real
 * `SubagentStop` inputs every field below was present and `agent_id` was the id in the agent's file name. A change
 * goes through `update-format-contract`.
 */
/**
 * The field every hook input carries, whichever event it was: where the session is running. Measured on 5 of 5 real
 * `Stop` inputs (`the-agent-nobody-watches.md` B8b) and present on the `SubagentStop` inputs of B4. It is what says
 * which project a session belongs to before anything of that session has been read.
 */
export const HOOK_INPUT = {
  fields: { workingDirectory: 'cwd' },
} as const;

export const SUBAGENT_STOP = {
  event: 'SubagentStop',
  fields: {
    event: 'hook_event_name',
    /** The main session's transcript: D2. */
    transcriptPath: 'transcript_path',
    /** The id in the agent's own file name, `agent-<id>.jsonl`: B4b, 4 of 4. */
    agentId: 'agent_id',
    /** The agent's final text. B4c: not yet on disk when the hook ran, on 4 of 4 agents. */
    lastMessage: 'last_assistant_message',
    /** The session the agent belongs to: what an alert is remembered under until its turn ends. */
    sessionId: 'session_id',
  },
} as const;

/**
 * What a `Stop` hook is handed, and the event that shows a `systemMessage`
 * (`specs/2026-09-16-a-notice-in-the-conversation.md` §3a, B6a). Measured on v2.1.236: the field is rendered under
 * the assistant's reply as `Stop says: …`, and B6b found it absent from the model's context.
 */
export const STOP = {
  event: 'Stop',
  fields: {
    event: 'hook_event_name',
    sessionId: 'session_id',
    /**
     * That this hook run is already inside a continuation it caused before (D15). Measured `true` on the `Stop`
     * that ended such a continuation and `false` on the next turn's (B9c), so it is what keeps one notice from
     * becoming a loop.
     */
    active: 'stop_hook_active',
  },
} as const;

/**
 * What a `PreToolUse` hook on the shell is handed (`specs/2026-09-16-worth-running-every-day.md` R18, R19). **Documented,
 * not measured**: B7 of that specification records what a real input carries and what exit 2 does.
 */
export const PRE_TOOL_USE = {
  event: 'PreToolUse',
  fields: {
    event: 'hook_event_name',
    toolName: 'tool_name',
    toolInput: 'tool_input',
    /** Inside `tool_input` for the shell tool. */
    command: 'command',
    /** Where the shell is when the command runs: what `.` and a glob in it are read against. */
    cwd: 'cwd',
  },
  /** The one tool `refuse` reads a command line from. */
  shellTool: 'Bash',
} as const;

/**
 * The universal output fields a hook's JSON on stdout may carry to reach a person. `systemMessage` is documented as a
 * warning shown to the user (D5): from `SubagentStop` it reached neither the user nor the model (B4d, B4f), and from
 * `Stop` it reached the user and not the model (B6a, B6b). `terminalSequence` showed in the terminal interface (B4f).
 */
export const HOOK_OUTPUT = {
  systemMessage: 'systemMessage',
  terminalSequence: 'terminalSequence',
  /**
   * What keeps a turn from ending and hands `reason` to the session's own agent, returned with exit 0
   * (`the-agent-tells-you.md` D16). Measured on v2.1.236: the agent answers it in a message of its own, and the
   * person sees the reason too, framed by Claude Code as `Stop hook error:` (B9a).
   */
  decision: 'decision',
  block: 'block',
  reason: 'reason',
} as const;

/**
 * The escape sequences the reference allows in `terminalSequence`. Anything outside the allowlist makes Claude Code
 * ignore the whole field, so a control character inside the words would silence the notice.
 */
export const TERMINAL = {
  osc: '\u001b]',
  bel: '\u0007',
  /** iTerm2, Windows Terminal, WezTerm, ConEmu: `9;<text>`. */
  notify: '9',
  /** urxvt, Ghostty, Warp: `777;notify;<title>;<body>`. */
  notifyWithTitle: '777;notify',
} as const;

/** A path the reference writes with a leading `~/` in its examples. Expanded rather than read as relative. */
export const HOME_PREFIX = '~/';
