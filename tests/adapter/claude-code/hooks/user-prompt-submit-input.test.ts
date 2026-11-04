// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseUserPromptSubmitInput } from '../../../../src/adapter/claude-code/hooks/user-prompt-submit-input.ts';

const input = (prompt: unknown, rest: Record<string, unknown> = {}) =>
  JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt, cwd: '/Users/someone/shop', session_id: 's', ...rest });

test('the message, its folder, and the lines Claude Code wrapped as a paste (§3a: tags on lines of their own)', () => {
  const prompt = ['wire this up', '', '<pasted_content id="8477">', 'line one', 'line two', '</pasted_content id="8477">', ''].join('\n');
  const parsed = parseUserPromptSubmitInput(input(prompt));
  assert.deepEqual(parsed, { message: { text: prompt, workingDirectory: '/Users/someone/shop', sessionId: 's', pastes: [{ first: 4, last: 5 }] } });
});

test('a tag left open, or a tag inside a line the person typed, is no paste', () => {
  const open = parseUserPromptSubmitInput(input('a\n<pasted_content id="1">\nb'));
  const inline = parseUserPromptSubmitInput(input('see <pasted_content id="1"> and </pasted_content id="1"> here'));
  assert.ok('message' in open && 'message' in inline);
  assert.deepEqual(open.message.pastes, []);
  assert.deepEqual(inline.message.pastes, []);
});

test('another event, broken JSON and a missing prompt are named, never thrown', () => {
  assert.deepEqual(parseUserPromptSubmitInput('{'), { unusable: 'not-json' });
  assert.deepEqual(parseUserPromptSubmitInput(input('x', { hook_event_name: 'Stop' })), { unusable: 'another-event' });
  assert.deepEqual(parseUserPromptSubmitInput(input(undefined)), { unusable: 'field-missing' });
});
