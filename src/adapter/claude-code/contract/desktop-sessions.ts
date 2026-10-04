// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Where the Claude desktop app keeps what it knows about a conversation, and the two fields agentwhy reads from it
 * (`.ai/specs/2026-10-01-claude-desktop-conversations.md` CD1). The app runs Claude Code but writes no `ai-title` into
 * the transcript: the name its sidebar shows is in a file of the app's own. Measured 2026-10-01 on macOS alone (CDB1,
 * app 2.16120.0 running Claude Code 2.1.284, 3 of 3 desktop conversations): one JSON object per conversation, two
 * directory levels under the folder, whose `cliSessionId` is the transcript's session id and whose `title` is the name
 * the sidebar shows. The file also holds what must never be read - MCP server configuration, permissions, prompt
 * snapshots - which is why the fields read are named here and nothing else is (CD4). Where the app keeps this on
 * Windows is not measured (CDB5), so no path is guessed there (CD6).
 */
export const DESKTOP_SESSIONS = {
  /** Under the home directory, on macOS. */
  folder: ['Library', 'Application Support', 'Claude', 'claude-code-sessions'],
  /** The file sits exactly this many directory levels under the folder - two ids whose meaning is not measured. */
  depth: 2,
  filePrefix: 'local_',
  fileSuffix: '.json',
  /** The transcript's session id - the join to `~/.claude/projects/<project>/<session id>.jsonl`. */
  sessionIdField: 'cliSessionId',
  /** The name the app's sidebar shows. A model wrote it from what the person typed: content, never structure (L009). */
  titleField: 'title',
} as const;

/** Whether a directory entry's name is a desktop session file. Anything else in those folders is not read. */
export function isDesktopSessionFileName(name: string): boolean {
  return name.startsWith(DESKTOP_SESSIONS.filePrefix) && name.endsWith(DESKTOP_SESSIONS.fileSuffix);
}
