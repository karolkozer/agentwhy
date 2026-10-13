// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseCopilotPreToolUseInput } from '../../../../src/adapter/copilot/hooks/pre-tool-use-input.ts';

// `copilot-blocks-too` §2a: every key the CLI 1.0.95 handed a hook in `~/.copilot/hooks/`, with fictional values.
const PROJECT = '/Users/someone/Projects/shop';
const input = (tool: string, toolInput: object, overrides: object = {}) =>
  JSON.stringify({
    hook_event_name: 'PreToolUse',
    session_id: 'a1b2c3d4-0000-4000-8000-000000000000',
    timestamp: '2026-10-12T09:00:00.000Z',
    cwd: PROJECT,
    tool_name: tool,
    tool_input: toolInput,
    ...overrides,
  });

// CB1: the shell's input is Claude Code's in shape.
test('a shell call gives its command line and the folder it runs in', () => {
  assert.deepEqual(parseCopilotPreToolUseInput(input('Bash', { command: 'cat .env', description: 'Show it' })), { command: 'cat .env', cwd: PROJECT });
  assert.deepEqual(parseCopilotPreToolUseInput(input('Bash', { command: 'cat .env' }, { cwd: '' })), { command: 'cat .env' });
});

// CB2, CB5: a file tool is judged as the line that prints its file - every key that can name one, each quoted whole.
test('Read, Write, Edit and read_file are the line that prints each file they name', () => {
  assert.deepEqual(parseCopilotPreToolUseInput(input('Read', { path: `${PROJECT}/.env` })), { command: `cat -- '${PROJECT}/.env'`, cwd: PROJECT });
  assert.deepEqual(parseCopilotPreToolUseInput(input('Read', { path: `${PROJECT}/.env`, view_range: [1, 3] })), { command: `cat -- '${PROJECT}/.env'`, cwd: PROJECT }, 'a part of a file is that file');
  assert.deepEqual(parseCopilotPreToolUseInput(input('Write', { path: '.env', file_text: 'KEY=x' })), { command: "cat -- '.env'", cwd: PROJECT }, 'writing a file reaches it');
  assert.deepEqual(parseCopilotPreToolUseInput(input('Edit', { path: 'config/.env', old_str: 'a', new_str: 'b' })), { command: "cat -- 'config/.env'", cwd: PROJECT });
  assert.deepEqual(parseCopilotPreToolUseInput(input('Read', { path: 'a.txt', file_path: 'b.txt' })), { command: "cat -- 'a.txt' 'b.txt'", cwd: PROJECT }, 'both keys are read');
  assert.deepEqual(parseCopilotPreToolUseInput(input('read_file', { filePath: `${PROJECT}/.env`, startLine: 1, endLine: 2 })), { command: `cat -- '${PROJECT}/.env'`, cwd: PROJECT });
  assert.deepEqual(parseCopilotPreToolUseInput(input('Read', { path: "it's $(here).env" })), { command: `cat -- 'it'\\''s $(here).env'`, cwd: PROJECT }, 'a quote or a substitution in a name stays one word');
});

// CB3, §2a e3: a search is ripgrep entering hidden files, over its paths or the folder it runs in, each glob a `-g` as
// ripgrep reads it - so `!` excludes and a leading `**/` matches at any depth, as `refuse`'s reading of ripgrep knows.
test('Grep and grep_search are ripgrep entering hidden files, narrowed as ripgrep narrows', () => {
  assert.deepEqual(parseCopilotPreToolUseInput(input('Grep', { pattern: 'KEY', paths: PROJECT, output_mode: 'content', '-n': true })), { command: `rg --hidden -- 'KEY' '${PROJECT}'`, cwd: PROJECT });
  assert.deepEqual(parseCopilotPreToolUseInput(input('Grep', { pattern: '-e KEY', paths: ['src', 'config'] })), { command: "rg --hidden -- '-e KEY' 'src' 'config'", cwd: PROJECT });
  assert.deepEqual(parseCopilotPreToolUseInput(input('Grep', { pattern: 'KEY', path: 'config' })), { command: "rg --hidden -- 'KEY' 'config'", cwd: PROJECT }, "Claude Code's name for a folder is read too");
  assert.deepEqual(parseCopilotPreToolUseInput(input('Grep', { pattern: 'KEY' })), { command: "rg --hidden -- 'KEY' '.'", cwd: PROJECT }, 'no paths is the folder it runs in');
  assert.deepEqual(parseCopilotPreToolUseInput(input('Grep', { pattern: 'KEY', glob: '**/*.ts' })), { command: "rg --hidden -g '**/*.ts' -- 'KEY' '.'", cwd: PROJECT });
  assert.deepEqual(parseCopilotPreToolUseInput(input('Grep', { pattern: 'KEY', glob: '!*.ts' })), { command: "rg --hidden -g '!*.ts' -- 'KEY' '.'", cwd: PROJECT });
  assert.deepEqual(parseCopilotPreToolUseInput(input('grep_search', { query: 'KEY', isRegexp: false, includePattern: '*.env' })), { command: "rg --hidden -g '*.env' -- 'KEY' '.'", cwd: PROJECT });
  assert.deepEqual(parseCopilotPreToolUseInput(input('grep_search', { query: 'KEY', isRegexp: true })), { command: "rg --hidden -- 'KEY' '.'", cwd: PROJECT });
});

// CB4, CB6, CB7, CBD8: a listing, a delegation and a tool no measurement has shown pass, by name alone (CBD6).
test('a listing, a delegation, an MCP call and an unknown tool pass', () => {
  for (const [tool, given] of [
    ['Glob', { pattern: '**/.env*', paths: [PROJECT] }],
    ['file_search', { query: '**/.env' }],
    ['search_code_subagent', { query: 'Where is the key?' }],
    ['task', { prompt: 'Read .env' }],
    ['github-mcp-server-get_file_contents', { path: '.env' }],
    ['bash', { command: 'cat .env' }],
  ] as const) {
    assert.deepEqual(parseCopilotPreToolUseInput(input(tool, given)), { anotherTool: true }, tool);
  }
});

// CB22, CB23, §2b g5: Copilot's agent in VS Code - its terminal is the shell, its patch reaches every file it names.
test('VS Code\'s run_in_terminal is the shell, and its apply_patch every file the patch names', () => {
  assert.deepEqual(parseCopilotPreToolUseInput(input('run_in_terminal', { command: 'cat .env', explanation: 'Show it', goal: 'g', mode: 'sync' })), { command: 'cat .env', cwd: PROJECT });
  const patch = ['*** Begin Patch', `*** Update File: ${PROJECT}/.env`, '@@', '-A=1', '+A=2', '*** Add File: notes.md', '+hello',
    '*** Delete File: old.txt', '*** Update File: a.ts', '*** Move to: b.ts', '*** End Patch'].join('\n');
  assert.deepEqual(parseCopilotPreToolUseInput(input('apply_patch', { explanation: 'x', input: patch })), { command: `cat -- '${PROJECT}/.env' 'notes.md' 'old.txt' 'a.ts' 'b.ts'`, cwd: PROJECT });
  assert.deepEqual(parseCopilotPreToolUseInput(input('apply_patch', { input: '*** Begin Patch\r\n*** Update File: x.ts\r\n*** End Patch\r\n' })), { command: "cat -- 'x.ts'", cwd: PROJECT }, 'a patch with Windows line ends');
  assert.deepEqual(parseCopilotPreToolUseInput(input('apply_patch', { input: '+*** Update File: changed-line.ts' })), { anotherTool: true }, 'a changed line is never a file line');
  assert.deepEqual(parseCopilotPreToolUseInput(input('apply_patch', { input: 'not a patch' })), { anotherTool: true }, 'no file line: passes, as an unknown tool');
  assert.deepEqual(parseCopilotPreToolUseInput(input('apply_patch', {})), { unusable: 'field-missing' });
  assert.deepEqual(parseCopilotPreToolUseInput(input('run_in_terminal', { explanation: 'x' })), { unusable: 'field-missing' });
  assert.deepEqual(parseCopilotPreToolUseInput(input('manage_todo_list', { todoList: [] })), { anotherTool: true });
});

test('an input it cannot use is named, never thrown', () => {
  assert.deepEqual(parseCopilotPreToolUseInput('{"hook_event_name":'), { unusable: 'not-json' });
  assert.deepEqual(parseCopilotPreToolUseInput('[]'), { unusable: 'not-json' });
  assert.deepEqual(parseCopilotPreToolUseInput(input('Bash', { command: 'cat .env' }, { hook_event_name: 'PostToolUse' })), { unusable: 'another-event' });
  assert.deepEqual(parseCopilotPreToolUseInput(input('Bash', {}, { tool_name: 3 })), { unusable: 'field-missing' });
  assert.deepEqual(parseCopilotPreToolUseInput(input('Bash', { command: ['zsh', '-lc', 'cat .env'] })), { unusable: 'field-missing' });
  assert.deepEqual(parseCopilotPreToolUseInput(input('Read', {})), { unusable: 'field-missing' });
  assert.deepEqual(parseCopilotPreToolUseInput(input('Read', { path: '' })), { unusable: 'field-missing' });
  assert.deepEqual(parseCopilotPreToolUseInput(input('Grep', { paths: '.' })), { unusable: 'field-missing' });
  assert.deepEqual(parseCopilotPreToolUseInput(input('Read', { path: '.env' }, { tool_input: 'x' })), { unusable: 'field-missing' });
});
