// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join, relative, sep } from 'node:path';

/**
 * Where the ChatGPT desktop app runs a chat that has no project: a folder it makes under the home directory, named after
 * the day and the chat (`.ai/specs/2026-09-30-run-from-another-app.md` OAB5). Measured 2026-10-01: the recorded `cwd` of
 * 7 of 153 rollouts, written by `originator` `codex_work_desktop` with `thread_source` `chatgpt_handoff`, was
 * `~/Documents/Codex/<YYYY-MM-DD>/<chat>`. Other systems, and other versions of the app, are not measured.
 */
const CHAT_ROOT = ['Documents', 'Codex'] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Whether a folder is one the ChatGPT app made for a chat with no project: no project of the person's (V10b). */
export function inChatFolder(path: string, home: string): boolean {
  const between = relative(join(home, ...CHAT_ROOT), path);
  if (between === '' || isAbsolute(between) || between.startsWith('..')) return false;
  const [day, chat] = between.split(sep);
  return day !== undefined && DAY.test(day) && chat !== undefined && chat !== '';
}
