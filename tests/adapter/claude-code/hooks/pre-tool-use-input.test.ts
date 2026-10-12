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
  assert.deepEqual(parsePreToolUseInput(input({ tool_name: 'Write', tool_input: { file_path: '.env', content: 'x' } })), { anotherTool: true });
});

// `2026-10-12-a-read-outside-the-project.md` RX1: a `Read` is the line that prints its one file, its path quoted whole.
test('a Read gives the line that prints its file', () => {
  const read = (file_path: unknown) => parsePreToolUseInput(input({ tool_name: 'Read', tool_input: { file_path }, cwd: '/Users/someone/chat' }));
  assert.deepEqual(read('/Users/someone/Projects/lessons/note.md'), { command: "cat -- '/Users/someone/Projects/lessons/note.md'", cwd: '/Users/someone/chat' });
  assert.deepEqual(read("/Users/someone/it's here/a b.md"), { command: "cat -- '/Users/someone/it'\\''s here/a b.md'", cwd: '/Users/someone/chat' });
  assert.deepEqual(read(''), { unusable: 'field-missing' });
  assert.deepEqual(read(3), { unusable: 'field-missing' });
});

test('an input it cannot use is named, never thrown', () => {
  assert.deepEqual(parsePreToolUseInput('{"hook_event_name":'), { unusable: 'not-json' });
  assert.deepEqual(parsePreToolUseInput(input({ hook_event_name: 'SubagentStop' })), { unusable: 'another-event' });
  assert.deepEqual(parsePreToolUseInput(input({ tool_input: { command: 3 } })), { unusable: 'field-missing' });
  assert.deepEqual(parsePreToolUseInput(input({ tool_input: 'cat .env' })), { unusable: 'field-missing' });
});
