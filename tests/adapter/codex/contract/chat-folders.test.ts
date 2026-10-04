// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { inChatFolder } from '../../../../src/adapter/codex/contract/chat-folders.ts';

const HOME = '/Users/someone';

// which-project V10b, measured on 7 rollouts of the ChatGPT app: a chat with no project runs under the day and its name.
test('the ChatGPT app\'s folder for a chat with no project is told apart from a folder a person made there', () => {
  assert.equal(inChatFolder('/Users/someone/Documents/Codex/2026-10-01/referenced-chat', HOME), true);
  assert.equal(inChatFolder('/Users/someone/Documents/Codex/2026-10-01/referenced-chat/src', HOME), true);
  assert.equal(inChatFolder('/Users/someone/Documents/Codex/2026-10-01', HOME), false, 'the day alone is no chat');
  assert.equal(inChatFolder('/Users/someone/Documents/Codex/notes', HOME), false);
  assert.equal(inChatFolder('/Users/someone/Documents/Codex', HOME), false);
  assert.equal(inChatFolder('/Users/someone/Projects/2026-10-01/app', HOME), false);
});
