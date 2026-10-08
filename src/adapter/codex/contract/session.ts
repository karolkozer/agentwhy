// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
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
  /** Which Codex app wrote the file: `codex-tui`, `codex_vscode`, `Codex Desktop`, `codex_work_desktop`, `codex_exec` (CXB3). */
  originator: 'originator',
  filePrefix: 'rollout-',
  fileSuffix: '.jsonl',
} as const;

/**
 * Codex's own folder, under the home directory: where its terminal app, its VS Code extension and the desktop app keep
 * their conversations (X1; `run-from-another-app` OAB4, OAB5). There, Codex is used on this computer (`codex-blocks-too`
 * CK6). `$CODEX_HOME` is not measured (XB6).
 */
export const CODEX_FOLDER = ['.codex'] as const;

/** Where Codex keeps its rollouts, under the home directory (X1, §2.1). `$CODEX_HOME` is not measured (XB6). */
export const SESSIONS_ROOT = [...CODEX_FOLDER, 'sessions'] as const;

/**
 * Who is reading a conversation, by its first line (`2026-10-02-codex-says-it-too.md` CXB3). Over 175 rollouts of
 * 2026-10-02: every conversation a person held - in the terminal, VS Code, the Codex app and the ChatGPT app - had the
 * `source` `vscode` (139); a scripted run `exec` (32); a thread another started an object (32). The terminal app is the
 * one whose `originator` is `codex-tui`.
 */
export const READER = {
  personSource: 'vscode',
  terminalOriginator: 'codex-tui',
  /**
   * The desktop app's names (its plain and work builds). Measured 2026-10-02 on the maintainer's conversations: with
   * a Stop block, the desktop app folds everything before the bubble into its "Worked for ..." row - a control run
   * without agentwhy showed the same answer in the open - while VS Code's Codex folds nothing (CXB5's display note).
   */
  desktopOriginators: ['Codex Desktop', 'codex_work_desktop'],
} as const;

/**
 * A thread continued in a file of its own (§2.14, XD10; measured 2026-10-07 on the desktop app's 0.155 builds): the new
 * file's first `session_meta` carries the thread's own `id` and a `history_base` naming that thread and where its history
 * ends in the first file - a byte offset on a line boundary (2 of 2) and the ordinal the new file's lines continue from
 * (2 of 2). Its name is `rollout-<time>-<thread id>_<new id>.jsonl`. The base file goes on past the offset with a branch
 * the thread left behind (11 and 15 lines, an aborted turn among them), written before the continuation.
 */
export const HISTORY_BASE = {
  key: 'history_base',
  threadId: 'thread_id',
  endByteOffset: 'end_byte_offset',
  endOrdinalExclusive: 'end_ordinal_exclusive',
} as const;

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
  /** When the line was written, ISO: a thread's earliest line is its first session (CXB5). */
  updatedAt: 'updated_at',
} as const;
