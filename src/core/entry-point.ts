// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Which way into the agent a conversation was started by, in the words a person knows it by
 * (`.ai/specs/2026-09-27-which-project.md` V4): the terminal, a code editor, the Claude desktop app
 * (`2026-10-01-claude-desktop-conversations.md` CD7), or a script. `unknown` is a way the
 * adapter recorded and does not know - counted, never named, and never read as the nearest known one.
 */
export type EntryPoint = 'terminal' | 'editor' | 'desktop' | 'script' | 'unknown';
