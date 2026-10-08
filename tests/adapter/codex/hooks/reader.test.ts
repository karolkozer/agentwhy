// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { codexReaderOf } from '../../../../src/adapter/codex/hooks/reader.ts';
import { FileAccessError } from '../../../../src/ports/file-access-error.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';

const first = (payload: object | undefined): FileReader => ({
  readText: async () => '',
  readLines: async function* (path) {
    if (payload === undefined) throw new FileAccessError('not-found', path);
    yield JSON.stringify({ type: 'session_meta', payload });
    yield JSON.stringify({ type: 'turn_context', payload: {} });
  },
});

// `codex-says-it-too` CXB3, CX4: who reads a Codex conversation, from its rollout's first line alone.
test('a person reads a conversation whose source is vscode, and the terminal app says its first quiet turn as a line', async () => {
  // The desktop app's builds fold the turn away under a block (CXB5's display note): the reader says so. Only the
  // terminal app shows a hook's line (CXB4, CXB7): the desktop app and the VS Code panel show a block alone.
  assert.deepEqual(await codexReaderOf(first({ source: 'vscode', originator: 'Codex Desktop' }), '/r.jsonl'), { attended: true, quietSaidByAgent: true, foldsTurn: true, showsLine: false });
  assert.deepEqual(await codexReaderOf(first({ source: 'vscode', originator: 'codex_work_desktop' }), '/r.jsonl'), { attended: true, quietSaidByAgent: true, foldsTurn: true, showsLine: false });
  assert.deepEqual(await codexReaderOf(first({ source: 'vscode', originator: 'codex_vscode' }), '/r.jsonl'), { attended: true, quietSaidByAgent: true, foldsTurn: false, showsLine: false });
  assert.deepEqual(await codexReaderOf(first({ source: 'vscode', originator: 'codex-tui' }), '/r.jsonl'), { attended: true, quietSaidByAgent: false, foldsTurn: false, showsLine: true });
});

test('a scripted run, a thread another started, an unreadable rollout or none is nobody reading', async () => {
  const nobody = { attended: false, quietSaidByAgent: false, foldsTurn: false, showsLine: false };
  assert.deepEqual(await codexReaderOf(first({ source: 'exec', originator: 'codex_exec' }), '/r.jsonl'), nobody);
  assert.deepEqual(await codexReaderOf(first({ source: { subagent: {} }, originator: 'codex_vscode' }), '/r.jsonl'), nobody);
  assert.deepEqual(await codexReaderOf(first(undefined), '/r.jsonl'), nobody);
  assert.deepEqual(await codexReaderOf(first({ source: 'vscode' }), undefined), nobody);
});
