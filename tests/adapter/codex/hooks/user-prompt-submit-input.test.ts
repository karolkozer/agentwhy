// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseCodexUserPromptSubmitInput } from '../../../../src/adapter/codex/hooks/user-prompt-submit-input.ts';

test('Codex\'s input as measured on 0.162.1: the message whole, its folder, and no paste of Codex\'s marking (§3a)', () => {
  const text = JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'wire this up\nx', cwd: '/Users/someone/shop', model: 'm', permission_mode: 'default', session_id: 's', transcript_path: '/tmp/r.jsonl', turn_id: 't' });
  assert.deepEqual(parseCodexUserPromptSubmitInput(text), { message: { text: 'wire this up\nx', workingDirectory: '/Users/someone/shop', sessionId: 's', pastes: [] } });
});

test('Codex\'s other events and broken input are named, never thrown', () => {
  assert.deepEqual(parseCodexUserPromptSubmitInput('nope'), { unusable: 'not-json' });
  assert.deepEqual(parseCodexUserPromptSubmitInput(JSON.stringify({ hook_event_name: 'Stop', prompt: 'x' })), { unusable: 'another-event' });
  assert.deepEqual(parseCodexUserPromptSubmitInput(JSON.stringify({ hook_event_name: 'UserPromptSubmit' })), { unusable: 'field-missing' });
});
