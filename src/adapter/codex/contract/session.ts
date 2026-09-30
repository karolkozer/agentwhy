/** First-line discovery (§2.1, §2.7). Measured 2026-09-29; action and message semantics have separate gates. */
export const SESSION = {
  lineType: 'type',
  metadataType: 'session_meta',
  payload: 'payload',
  id: 'id',
  parentId: 'parent_thread_id',
  workingDirectory: 'cwd',
  historyMode: 'history_mode',
  /** The build that wrote the file: `0.154.0-alpha.6.2`, `0.155.0-alpha.16.3`, `0.155.0-alpha.9` (§2.7), `0.157.0` (§2.8). */
  version: 'cli_version',
  /** A string for a person's session (`exec` in §2.8); an object `{subagent: …}` for a thread another started (§2.4). */
  source: 'source',
  filePrefix: 'rollout-',
  fileSuffix: '.jsonl',
} as const;

/** Where Codex keeps its rollouts, under the home directory (X1, §2.1). `$CODEX_HOME` is not measured (XB6). */
export const SESSIONS_ROOT = ['.codex', 'sessions'] as const;

export const HISTORY_MODES = ['paginated', 'legacy'] as const;
export type HistoryMode = (typeof HISTORY_MODES)[number] | 'unknown';

/**
 * Codex's own list of thread names, under the home directory: one JSON object a line, `{"id", "thread_name",
 * "updated_at"}`, appended as a name is given (a later line names the same id again). Measured 2026-09-30 on 55 lines:
 * every root thread started from the VS Code extension, the desktop app and the terminal app (0.154.0-alpha.6.2 to
 * 0.159.2) had a line, and no thread whose `source` is `exec` did (20); the name was never the person's first message nor its start, so it
 * is a title Codex wrote, as Claude Code's `ai-title` is. The `id` is the rollout's thread id.
 */
export const THREAD_NAMES = {
  file: ['.codex', 'session_index.jsonl'],
  id: 'id',
  name: 'thread_name',
} as const;
