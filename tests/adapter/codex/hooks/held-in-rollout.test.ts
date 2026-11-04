// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { heldInRollout } from '../../../../src/adapter/codex/hooks/held-in-rollout.ts';
import { FileAccessError } from '../../../../src/ports/file-access-error.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';

function rollout(lines: readonly string[], counted: { read: number }): FileReader {
  return {
    readText: async () => { throw new Error('the whole rollout is never read'); },
    readLines: async function* () { for (const line of lines) { counted.read += 1; yield line; } },
  };
}
const input = JSON.stringify({ hook_event_name: 'UserPromptSubmit', transcript_path: '/Users/someone/.codex/sessions/r.jsonl' });
const meta = (source: string, originator: string) => JSON.stringify({ type: 'session_meta', payload: { id: 't', source, originator } });

test('where a Codex conversation is held, from the rollout\'s first line alone', async () => {
  const counted = { read: 0 };
  assert.equal(await heldInRollout(rollout([meta('vscode', 'Codex Desktop'), 'x', 'y'], counted), input), 'desktop');
  assert.equal(counted.read, 1, 'one line read, however long the rollout');
  assert.equal(await heldInRollout(rollout([meta('vscode', 'codex-tui')], { read: 0 }), input), 'terminal');
  assert.equal(await heldInRollout(rollout([meta('exec', 'codex_exec')], { read: 0 }), input), 'script');
});

test('no rollout, another first line, or no path is nothing said', async () => {
  const missing: FileReader = { readText: async () => '', readLines: async function* () { throw new FileAccessError('not-found', '/x'); } };
  assert.equal(await heldInRollout(missing, input), undefined);
  assert.equal(await heldInRollout(rollout(['{"type":"response_item"}'], { read: 0 }), input), undefined);
  assert.equal(await heldInRollout(rollout([meta('vscode', 'codex-tui')], { read: 0 }), '{}'), undefined);
});
