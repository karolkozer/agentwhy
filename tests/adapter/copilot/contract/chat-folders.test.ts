// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { inCopilotChatFolder } from '../../../../src/adapter/copilot/contract/chat-folders.ts';

const HOME = '/Users/someone';

// `what-copilot-wrote` CPB40 and CPD8, measured on 4 chats of the desktop app: a chat with no project runs under the day
// and its name, and is no project, as a ChatGPT app chat is not.
test('the desktop app\'s folder for a chat with no project is told apart from a folder a person made there', () => {
  assert.equal(inCopilotChatFolder('/Users/someone/.copilot/chats/2026-10-09/quiet-river-a1b2c3d4', HOME), true);
  assert.equal(inCopilotChatFolder('/Users/someone/.copilot/chats/2026-10-09/quiet-river-a1b2c3d4/notes', HOME), true);
  assert.equal(inCopilotChatFolder('/Users/someone/.copilot/chats/2026-10-09', HOME), false, 'the day alone is no chat');
  assert.equal(inCopilotChatFolder('/Users/someone/.copilot/chats/drafts', HOME), false);
  assert.equal(inCopilotChatFolder('/Users/someone/.copilot/chats', HOME), false);
  assert.equal(inCopilotChatFolder('/Users/someone/.copilot/session-state/2026-10-09/x', HOME), false);
  assert.equal(inCopilotChatFolder('/Users/someone/Projects/shop', HOME), false);
});
