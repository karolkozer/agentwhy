// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join, relative, sep } from 'node:path';

/**
 * Where the desktop app runs a chat that has no project: a folder it makes under the home directory, named after the day
 * and the chat (spec §2.8 CPB14, §2.16 CPB40). Measured 2026-10-09 on 4 of 4 chats: `~/.copilot/chats/<YYYY-MM-DD>/<chat>`,
 * where `<chat>` was two words and the first eight characters of the session's id. A chat is no project of the person's,
 * as a ChatGPT app chat is not (CPD8, `which-project` V10b): the rule asks the day and a name, as that app's does, and
 * not the name's shape, which four chats do not make a rule of. Other systems are not measured.
 */
const CHAT_ROOT = ['.copilot', 'chats'] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Whether a folder is one the desktop app made for a chat with no project. */
export function inCopilotChatFolder(path: string, home: string): boolean {
  const between = relative(join(home, ...CHAT_ROOT), path);
  if (between === '' || isAbsolute(between) || between.startsWith('..')) return false;
  const [day, chat] = between.split(sep);
  return day !== undefined && DAY.test(day) && chat !== undefined && chat !== '';
}
