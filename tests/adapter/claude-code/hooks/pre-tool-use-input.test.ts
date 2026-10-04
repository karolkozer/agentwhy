// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parsePreToolUseInput } from '../../../../src/adapter/claude-code/hooks/pre-tool-use-input.ts';

const input = (overrides: object) =>
  JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'cat .env' }, ...overrides });

// worth-running-every-day R18, R20.
test('a shell call gives its command line', () => {
  assert.deepEqual(parsePreToolUseInput(input({})), { command: 'cat .env' });
});

test('a call to another tool is not this hook to judge', () => {
  assert.deepEqual(parsePreToolUseInput(input({ tool_name: 'Read', tool_input: { file_path: '.env' } })), { anotherTool: true });
});

test('an input it cannot use is named, never thrown', () => {
  assert.deepEqual(parsePreToolUseInput('{"hook_event_name":'), { unusable: 'not-json' });
  assert.deepEqual(parsePreToolUseInput(input({ hook_event_name: 'SubagentStop' })), { unusable: 'another-event' });
  assert.deepEqual(parsePreToolUseInput(input({ tool_input: { command: 3 } })), { unusable: 'field-missing' });
  assert.deepEqual(parsePreToolUseInput(input({ tool_input: 'cat .env' })), { unusable: 'field-missing' });
});
