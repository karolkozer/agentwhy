// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { codexStopFolder, parseCodexStopInput } from '../../../../src/adapter/codex/hooks/stop-input.ts';

// `codex-says-it-too` CX1: Codex's Stop, as CKB12 measured it and D18 documents it, read into the turn `watch` reads.
const STOP = {
  hook_event_name: 'Stop', session_id: 'thread-1', turn_id: 'turn-1', transcript_path: '/Users/someone/.codex/sessions/r.jsonl',
  cwd: '/Users/someone/Projects/shop/web', stop_hook_active: false, last_assistant_message: 'Done.',
};

test('a Codex Stop is the session, its rollout, its last words and whether it continues a block', () => {
  assert.deepEqual(parseCodexStopInput(JSON.stringify(STOP)), {
    turn: { sessionId: 'thread-1', active: false, transcriptPath: STOP.transcript_path, lastMessage: 'Done.' },
  });
  assert.deepEqual(parseCodexStopInput(JSON.stringify({ ...STOP, stop_hook_active: true, transcript_path: null })), {
    turn: { sessionId: 'thread-1', active: true, lastMessage: 'Done.' },
  });
  assert.equal(codexStopFolder(JSON.stringify(STOP)), '/Users/someone/Projects/shop/web');
});

test('what cannot be used is named, never thrown', () => {
  assert.deepEqual(parseCodexStopInput('not json'), { unusable: 'not-json' });
  assert.deepEqual(parseCodexStopInput(JSON.stringify({ ...STOP, hook_event_name: 'PreToolUse' })), { unusable: 'another-event' });
  assert.deepEqual(parseCodexStopInput(JSON.stringify({ ...STOP, session_id: '' })), { unusable: 'field-missing' });
  assert.equal(codexStopFolder('not json'), undefined);
});
