// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Which way into Claude Code a session was started by, as its transcript records it in `entrypoint` - by the words a
 * person knows it by (`.ai/specs/2026-09-27-which-project.md` V4). These are the values Claude Code also gives its hooks
 * as `CLAUDE_CODE_ENTRYPOINT` (`the-agent-tells-you.md` B9e2: terminal `claude`, the editor extension, `claude -p`).
 *
 * Measured, not guessed (which-project VB5, 2026-09-28): the last megabyte of each of 244 transcripts carries the field,
 * `claude-vscode` in 180, `cli` in 62, `sdk-cli` in 2, and no transcript carries two values. A fourth value, measured
 * 2026-10-01 (`claude-desktop-conversations.md` CDB1, CD7): the Claude desktop app writes `claude-desktop`, on every
 * line that carries the field in 3 of 3 desktop transcripts, one value each. No other value has been
 * seen: one that is not listed here is said to be unknown, never read as the nearest of these. What the extension writes
 * inside Cursor, and the plugin inside JetBrains, is not measured (VB4), so `editor` is a code editor and not "VS Code".
 */
export const ENTRY_POINT_VALUES = {
  terminal: 'cli',
  editor: 'claude-vscode',
  script: 'sdk-cli',
  desktop: 'claude-desktop',
} as const;
