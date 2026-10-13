// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { inAppChatFolder } from '../../../../src/report/start/projects/app-chat-folders.ts';

const HOME = '/Users/someone';

test('a chat folder of either app is no project, and a project is not taken for one', () => {
  assert.equal(inAppChatFolder('/Users/someone/Documents/Codex/2026-10-01/referenced-chat', HOME), true, 'the ChatGPT app\'s');
  assert.equal(inAppChatFolder('/Users/someone/.copilot/chats/2026-10-09/quiet-river-a1b2c3d4', HOME), true, 'the Copilot desktop app\'s');
  assert.equal(inAppChatFolder('/Users/someone/Projects/shop', HOME), false);
  assert.equal(inAppChatFolder('/Users/someone/.copilot/session-state/a1b2c3d4-0000-4000-8000-000000000000', HOME), false);
});
