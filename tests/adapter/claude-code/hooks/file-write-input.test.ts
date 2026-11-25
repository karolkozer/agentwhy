// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseFileWriteInput } from '../../../../src/adapter/claude-code/hooks/file-write-input.ts';

const input = (tool: string, toolInput: object, overrides: object = {}) =>
  JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: toolInput, cwd: '/Users/someone/app', ...overrides });

test('a Write gives its path and whole content', () => {
  assert.deepEqual(parseFileWriteInput(input('Write', { file_path: 'a.txt', content: 'hi' })), {
    path: 'a.txt',
    newText: 'hi',
    replaced: undefined,
    directory: '/Users/someone/app',
  });
});

test('an Edit gives the text it takes out and the text it puts in', () => {
  assert.deepEqual(
    parseFileWriteInput(input('Edit', { file_path: '/x/a.txt', old_string: 'o', new_string: 'n', replace_all: true })),
    { path: '/x/a.txt', newText: 'n', replaced: 'o', directory: '/Users/someone/app' },
  );
});

test('no cwd is no directory', () => {
  const parsed = parseFileWriteInput(input('Write', { file_path: 'a', content: '' }, { cwd: undefined }));
  assert.equal(parsed?.directory, undefined);
});

test('any other tool, event or shape is nothing', () => {
  assert.equal(parseFileWriteInput(input('Read', { file_path: 'a' })), undefined);
  assert.equal(parseFileWriteInput(input('Bash', { command: 'ls' })), undefined);
  assert.equal(parseFileWriteInput(input('NotebookEdit', { file_path: 'a', content: 'x' })), undefined);
  assert.equal(parseFileWriteInput(input('Write', { file_path: 'a', content: 'x' }, { hook_event_name: 'PostToolUse' })), undefined);
  assert.equal(parseFileWriteInput(input('Write', { content: 'x' })), undefined);
  assert.equal(parseFileWriteInput(input('Write', { file_path: 'a', content: 5 })), undefined);
  assert.equal(parseFileWriteInput(input('Edit', { file_path: 'a', old_string: 'o' })), undefined);
  assert.equal(parseFileWriteInput('{broken'), undefined);
});
