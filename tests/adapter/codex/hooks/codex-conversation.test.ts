// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { codexConversationOf } from '../../../../src/adapter/codex/hooks/codex-conversation.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { jsonl, writeSession } from '../../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();

/*
 * `codex-says-it-too` CXB5, CX8: one conversation, several session ids, joined only by Codex's thread index. The key is
 * the thread's earliest session id - never its name - and the session id itself wherever the index does not answer.
 */
test('the conversation is the thread\'s earliest session; without an index row, the session stands', async (t) => {
  const root = await writeSession(t, {
    'session_index.jsonl': jsonl(
      { id: 's-first', thread_name: 'Check the config', updated_at: '2026-10-02T11:00:00Z' },
      { id: 's-second', thread_name: 'Check the config', updated_at: '2026-10-02T11:01:00Z' },
      { id: 's-other', thread_name: 'Another chat', updated_at: '2026-10-02T10:00:00Z' },
      'not json',
      { id: 42, thread_name: 'broken row' },
    ),
  });
  const index = join(root, 'session_index.jsonl');

  assert.equal(await codexConversationOf(files, index, 's-second'), 's-first');
  assert.equal(await codexConversationOf(files, index, 's-first'), 's-first');
  assert.equal(await codexConversationOf(files, index, 's-other'), 's-other');
  assert.equal(await codexConversationOf(files, index, 's-unlisted'), 's-unlisted', 'an exec run has no row, and keeps its id');
  assert.equal(await codexConversationOf(files, '/nowhere/session_index.jsonl', 's-x'), 's-x', 'no index, no change');
});

// A rename appends a later line for the same id: the thread's name is its last line's, for every session of it.
test('a renamed thread stays one conversation', async (t) => {
  const root = await writeSession(t, {
    'session_index.jsonl': jsonl(
      { id: 's-first', thread_name: 'Untitled', updated_at: '2026-10-02T11:00:00Z' },
      { id: 's-second', thread_name: 'Untitled', updated_at: '2026-10-02T11:01:00Z' },
      { id: 's-first', thread_name: 'Check the config', updated_at: '2026-10-02T11:02:00Z' },
      { id: 's-second', thread_name: 'Check the config', updated_at: '2026-10-02T11:03:00Z' },
    ),
  });

  assert.equal(await codexConversationOf(files, join(root, 'session_index.jsonl'), 's-second'), 's-first');
});
