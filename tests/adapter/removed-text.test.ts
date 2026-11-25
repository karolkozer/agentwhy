// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { callsIn } from '../../src/adapter/claude-code/events/transcript-scan.ts';
import { readAction } from '../../src/adapter/codex/events/action-items.ts';
import { chatProfileOf } from '../../src/adapter/copilot/chat-log/chat-call-profiles.ts';
import { profileOf } from '../../src/adapter/copilot/events/call-profiles.ts';
import { fileChange } from '../helpers/codex-session.ts';
import { correlate } from '../../src/core/correlation/correlate.ts';
import { mainSource } from '../../src/core/evidence.ts';

// `2026-10-25-the-ai-changed-its-own-guard.md` OG2: what an edit takes out is carried apart from what it puts in, in every AI.
test('OG2: each AI\'s edit carries the text it takes out as removed, never as written', () => {
  const [edit] = callsIn({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_01EDITAAAAAAAAAAAAAAAAAA', name: 'Edit', input: { file_path: '/w/.claude/settings.local.json', old_string: '"Read(./.env)"', new_string: '' } }] },
  });
  assert.deepEqual(edit?.removed, ['"Read(./.env)"']);
  assert.deepEqual(edit?.written, ['']);
  const [write] = callsIn({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_01WRITEAAAAAAAAAAAAAAAAA', name: 'Write', input: { file_path: '/w/a.json', content: '{}' } }] },
  });
  assert.equal(write?.removed, undefined, 'a Write of a whole file: the record has no earlier text');

  const change = readAction(fileChange('exec_u', { '.claude/settings.json': { type: 'update', unified_diff: '@@\n-    "Read(./.env)",\n+    "Read(./notes)",\n context' } }));
  assert.deepEqual(change.removed, ['    "Read(./.env)",']);
  assert.deepEqual(change.written, ['    "Read(./notes)",']);

  assert.deepEqual(profileOf('edit', { path: '/w/x.json', old_str: 'a', new_str: 'b' }).removed, ['a']);
  assert.deepEqual(chatProfileOf('apply_patch', { input: '*** Begin Patch\n*** Update File: /w/x.json\n-a\n+b\n*** End Patch' }).removed, ['a']);
});

// The review of step 1: what a call took out reaches the event a report reads, through `correlate`.
test('OG2: the text taken out reaches the event through correlate', () => {
  const model = correlate({
    sessionId: 's', provider: 'claude-code', agents: [{ id: 'a', type: 'main', depth: 0 }],
    calls: [{ id: 'toolu_a', agentId: 'a', sequence: 1, toolName: 'Edit', input: {}, targets: ['/w/.claude/settings.json'], commands: [],
      resultShape: 'none', toolKnown: true, written: ['b'], removed: ['a'], evidence: { source: mainSource(), record: 1 } }],
    results: [{ callId: 'toolu_a', stage: 'model', completeness: 'complete', evidence: { source: mainSource(), record: 2 }, content: 'ok' }],
    delegations: [], delegationIndex: [], workingDirectories: [], messages: [], deliveredReports: [], agentReports: [], followUps: [],
    followUpIndex: [], turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [], gaps: [],
  });
  assert.deepEqual(model.events[0]?.removed, ['a']);
  assert.deepEqual(model.events[0]?.written, ['b']);
});

test('OG2: a Codex removed line that began with -- is kept; a header before the first hunk is not', () => {
  const change = readAction(fileChange('exec_v', { 'a.sql': { type: 'update', unified_diff: '--- a/a.sql\n+++ b/a.sql\n@@\n--- old comment\n+-- new comment' } }));
  assert.deepEqual(change.removed, ['-- old comment']);
});
