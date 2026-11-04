// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
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
test('a shell call gives its command line, the folder it runs in and its rollout', () => {
  assert.deepEqual(parseCodexPreToolUseInput(input({})), { command: 'cat .env', cwd: '/Users/someone/shop/apps/web', transcriptPath: '/Users/someone/.codex/sessions/rollout.jsonl' });
  assert.deepEqual(parseCodexPreToolUseInput(input({ cwd: '', transcript_path: '' })), { command: 'cat .env' });
});

test('a call to another tool passes', () => {
  assert.deepEqual(parseCodexPreToolUseInput(input({ tool_name: 'apply_patch', tool_input: { patch: '…' } })), { anotherTool: true });
});

test('an input it cannot use is named, never thrown', () => {
  assert.deepEqual(parseCodexPreToolUseInput('{"hook_event_name":'), { unusable: 'not-json' });
  assert.deepEqual(parseCodexPreToolUseInput(input({ hook_event_name: 'PostToolUse' })), { unusable: 'another-event' });
  assert.deepEqual(parseCodexPreToolUseInput(input({ tool_input: { command: ['zsh', '-lc', 'cat .env'] } })), { unusable: 'field-missing' });
});

// `2026-10-12-powershell-on-windows.md` PW8, PWB5: Codex on Windows hands its `Bash` tool a PowerShell line, run with
// `pwsh -Command`. Read as bash, `Get-Content -LiteralPath .\secret.txt` named no file, and a blocked one was printed. Its
// folder at a drive says Windows: the line is read as PowerShell there, and anywhere else as it was.
test('PW8: on Windows the line is PowerShell, read as the POSIX line it equals', () => {
  const windows = parseCodexPreToolUseInput(input({ cwd: String.raw`C:\Users\someone\shop`, tool_input: { command: String.raw`Get-Content -LiteralPath .\secret.txt` } }));
  assert.equal('command' in windows ? windows.command : undefined, 'cat -- ./secret.txt');
  const mac = parseCodexPreToolUseInput(input({ tool_input: { command: String.raw`Get-Content -LiteralPath .\secret.txt` } }));
  assert.equal('command' in mac ? mac.command : undefined, String.raw`Get-Content -LiteralPath .\secret.txt`, 'a folder at no drive keeps the line as written');
  // PW11: the line as Codex wrote it rides beside the reading, for RW15 to find its cell by; where they agree, nothing does.
  assert.equal('written' in windows ? windows.written : undefined, String.raw`Get-Content -LiteralPath .\secret.txt`);
  assert.equal('written' in mac, false);
});
