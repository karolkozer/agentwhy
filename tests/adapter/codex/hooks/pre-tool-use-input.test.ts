import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseCodexPreToolUseInput } from '../../../../src/adapter/codex/hooks/pre-tool-use-input.ts';

// CKB2: every key Codex 0.159.2 handed the hook, with fictional values.
const input = (overrides: object) =>
  JSON.stringify({
    cwd: '/Users/someone/shop/apps/web',
    hook_event_name: 'PreToolUse',
    model: 'a-model',
    permission_mode: 'default',
    session_id: '01a0f222-0000-7000-8000-000000000001',
    tool_input: { command: 'cat .env' },
    tool_name: 'Bash',
    tool_use_id: 'call_1',
    transcript_path: '/Users/someone/.codex/sessions/rollout.jsonl',
    turn_id: '01a0f222-0000-7000-8000-000000000002',
    ...overrides,
  });

// codex-blocks-too CK3, CK4.
test('a shell call gives its command line and the folder it runs in', () => {
  assert.deepEqual(parseCodexPreToolUseInput(input({})), { command: 'cat .env', cwd: '/Users/someone/shop/apps/web' });
  assert.deepEqual(parseCodexPreToolUseInput(input({ cwd: '' })), { command: 'cat .env' });
});

test('a call to another tool passes', () => {
  assert.deepEqual(parseCodexPreToolUseInput(input({ tool_name: 'apply_patch', tool_input: { patch: '…' } })), { anotherTool: true });
});

test('an input it cannot use is named, never thrown', () => {
  assert.deepEqual(parseCodexPreToolUseInput('{"hook_event_name":'), { unusable: 'not-json' });
  assert.deepEqual(parseCodexPreToolUseInput(input({ hook_event_name: 'PostToolUse' })), { unusable: 'another-event' });
  assert.deepEqual(parseCodexPreToolUseInput(input({ tool_input: { command: ['zsh', '-lc', 'cat .env'] } })), { unusable: 'field-missing' });
});
