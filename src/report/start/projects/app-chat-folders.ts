// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { inChatFolder } from '../../../adapter/codex/contract/chat-folders.ts';
import { inCopilotChatFolder } from '../../../adapter/copilot/contract/chat-folders.ts';

/**
 * Whether a folder is one an AI's app made for a chat with no project: the ChatGPT app's (`which-project.md` V10b) or the
 * Copilot desktop app's (`what-copilot-wrote` CPD8). Neither is a project of the person's, and Switch project hides and
 * counts them alike. The one question every place that hides such a folder asks, so the two apps cannot drift apart
 * (lesson L018); each app's folder shape stays in its own contract.
 */
export function inAppChatFolder(path: string, home: string): boolean {
  return inChatFolder(path, home) || inCopilotChatFolder(path, home);
}
