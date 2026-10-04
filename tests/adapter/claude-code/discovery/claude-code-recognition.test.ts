// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { recogniseClaudeCode } from '../../../../src/adapter/claude-code/discovery/claude-code-recognition.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';
import { meta } from '../../../helpers/codex-session.ts';
import { CANARY, jsonl, SESSION_ID, syntheticSessionFiles, writeSession } from '../../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();

// `2026-09-27-what-codex-wrote.md` X2 and the Claude Code contract's `recognition.ts`: a transcript by its first line.
test('a Claude Code transcript is recognised by content, a Codex rollout and anything else are not', async (t) => {
  const root = await writeSession(t, {
    ...syntheticSessionFiles(),
    'real-shape.jsonl': jsonl({ type: 'some-new-line-type', sessionId: 'real-shape', timestamp: '2026-09-29T10:00:00.000Z' }),
    'codex.jsonl': jsonl(meta('01a0ec9c-0000-7000-8000-000000000001')),
    'other.jsonl': jsonl({ type: CANARY, payload: {} }),
    'blank-first.jsonl': `\n\n${JSON.stringify({ type: 'user', message: { content: CANARY } })}\n`,
    'not-json.jsonl': `${CANARY}\n`,
    'damaged-first.jsonl': `{"type":"user","sessi\n${JSON.stringify({ type: 'user', sessionId: 'damaged-first' })}\n`,
    'damaged-codex.jsonl': `{"type":"session_me\n${JSON.stringify({ type: 'response_item', payload: {} })}\n`,
    'only-damaged.jsonl': `${'{"type":"user"\n'.repeat(20)}${JSON.stringify({ type: 'user', sessionId: 'late' })}\n`,
  });

  assert.equal(await recogniseClaudeCode(files, join(root, SESSION_ID)), 'recognised', 'a session directory, by its transcript');
  assert.equal(await recogniseClaudeCode(files, join(root, `${SESSION_ID}.jsonl`)), 'recognised');
  assert.equal(await recogniseClaudeCode(files, join(root, 'real-shape.jsonl')), 'recognised', 'an unlisted type with its session id');
  assert.equal(await recogniseClaudeCode(files, join(root, 'blank-first.jsonl')), 'recognised', 'the first non-blank line decides');
  assert.equal(await recogniseClaudeCode(files, join(root, 'codex.jsonl')), 'unknown', 'a Codex rollout is never a transcript');
  assert.equal(await recogniseClaudeCode(files, join(root, 'other.jsonl')), 'unknown');
  assert.equal(await recogniseClaudeCode(files, join(root, 'not-json.jsonl')), 'unknown');
  // A damaged line says how a write failed, not who wrote the file: `doctor` is there to diagnose it.
  assert.equal(await recogniseClaudeCode(files, join(root, 'damaged-first.jsonl')), 'recognised', 'a damaged first line is passed over');
  assert.equal(await recogniseClaudeCode(files, join(root, 'damaged-codex.jsonl')), 'unknown', 'the line after it still decides');
  assert.equal(await recogniseClaudeCode(files, join(root, 'only-damaged.jsonl')), 'unknown', 'a file of noise is not read whole');
  assert.equal(await recogniseClaudeCode(files, join(root, 'missing')), 'unavailable');
});

test('recognition reads the first line and closes the file', async () => {
  let closed = false;
  const reader: FileReader = {
    async readText() { throw new Error('never read whole'); },
    async *readLines() { try { yield JSON.stringify({ type: 'user' }); throw new Error('read past the first line'); } finally { closed = true; } },
  };
  assert.equal(await recogniseClaudeCode(reader, '/Users/someone/x.jsonl'), 'recognised');
  assert.equal(closed, true);
});
