// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { CodexTurnRefusals } from '../../../../src/adapter/codex/hooks/stop-refusals.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';
import { refusalReason } from '../../../../src/refuse/render/refusal-words.ts';

const reason = refusalReason('.env', '**/.env*', 0, { kind: 'named' }).trimEnd();
const cell = (turnId: string, output: unknown): string => JSON.stringify({
  type: 'response_item', payload: {
    type: 'custom_tool_call_output', output,
    internal_chat_message_metadata_passthrough: { turn_id: turnId },
  },
});
const refused = `Script error:\nCommand blocked by PreToolUse hook: ${reason}. Command: cat .env`;
const files = (...lines: string[]): FileReader => ({
  readText: async () => lines.join('\n'),
  readLines: async function* () { for (const line of lines) yield line; },
});
const stop = (active = false, path: string | null = '/sessions/fictional.jsonl'): string =>
  JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: active, turn_id: 'turn-2', transcript_path: path });

// CK13: the turn's own refusals, from the Stop input `watch` already read (`codex-says-it-too` CX2).
test('Stop reads only agentwhy refusals in the current turn', async () => {
  const found = await new CodexTurnRefusals(files(
    cell('turn-1', refused),
    cell('turn-2', 'ordinary output'),
    cell('turn-2', [{ type: 'input_text', text: refused }]),
  )).find(stop());

  assert.deepEqual(found.map((refusal) => refusal.path), ['.env']);
});

test('Stop finds nothing on its continuation, an absent transcript, another turn, or an input that is not one', async () => {
  for (const [text, lines] of [
    [stop(true), [cell('turn-2', refused)]],
    [stop(false, null), [cell('turn-2', refused)]],
    [stop(), [cell('turn-1', refused)]],
    ['not json', [cell('turn-2', refused)]],
  ] as const) {
    assert.deepEqual(await new CodexTurnRefusals(files(...lines)).find(text), []);
  }
});
