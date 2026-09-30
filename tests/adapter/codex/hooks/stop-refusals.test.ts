import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { CodexTurnRefusals } from '../../../../src/adapter/codex/hooks/stop-refusals.ts';
import { CodexStopCliCommand } from '../../../../src/cli/commands/codex-stop-cli-command.ts';
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
const input = (active = false, path: string | null = '/sessions/fictional.jsonl') => ({
  readAll: async () => JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: active, turn_id: 'turn-2', transcript_path: path }),
});

test('Stop reads only agentwhy refusals in the current turn, then asks Codex to say so without asking for a value', async () => {
  const reader = new CodexTurnRefusals(input(), files(
    cell('turn-1', refused),
    cell('turn-2', 'ordinary output'),
    cell('turn-2', [{ type: 'input_text', text: refused }]),
  ));
  const result = await new CodexStopCliCommand(reader, false).execute(['--codex']);
  assert.equal(result.kind, 'completed');
  if (result.kind !== 'completed') return;
  const output = JSON.parse(result.output) as { decision: string; reason: string };
  assert.equal(output.decision, 'block');
  assert.match(output.reason, /^agentwhy stopped a command that would have read the private file "\.env"/);
  assert.match(output.reason, /in their language, starting with \*\*agentwhy\*\*/);
  assert.match(output.reason, /Don't read it another way or ask for what's in it\./);
  // CKB14: the person reads it too, as "Hook feedback" in VS Code and "Blocked by hook" in the terminal.
  assert.ok(output.reason.split(/\s+/).length <= 60, `${output.reason.split(/\s+/).length} words`);
});

test('Stop stays silent on its continuation, an absent transcript, and another turn', async () => {
  for (const [hookInput, lines] of [
    [input(true), [cell('turn-2', refused)]],
    [input(false, null), [cell('turn-2', refused)]],
    [input(), [cell('turn-1', refused)]],
  ] as const) {
    const result = await new CodexStopCliCommand(new CodexTurnRefusals(hookInput, files(...lines)), false).execute(['--codex']);
    assert.deepEqual(result, { kind: 'completed', output: '', exitCode: 0 });
  }
});
