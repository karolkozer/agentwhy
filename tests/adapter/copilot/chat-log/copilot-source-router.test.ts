// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { CopilotSourceRouter, recogniseCopilotRecord, recogniseVsCodeChat } from '../../../../src/adapter/copilot/chat-log/copilot-source-router.ts';
import type { Recognition } from '../../../../src/core/session-format.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import type { SessionSource } from '../../../../src/core/session-source.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { editorStart, records, SESSION, sessionStart, userMessage } from '../../../helpers/copilot-session.ts';
import { jsonl, writeSession } from '../../../helpers/synthetic-session.ts';
import { chatLog } from '../../../helpers/vs-code-chat.ts';

// `.ai/plans/2026-10-13-what-vs-code-copilot-wrote.md` step 3, VCD1: one AI, two records, each read by its own source.

const files = new NodeFileSystem();
const recognise = (input: string): Promise<Recognition> => recogniseVsCodeChat(files, files, input);

test("a VS Code chat log is recognised by its first line, whatever its version; nothing else is", async (t) => {
  const root = await writeSession(t, {
    'chat.jsonl': chatLog([]),
    'later.jsonl': chatLog([], { version: 9 }),
    'runtime/events.jsonl': records(SESSION, sessionStart(SESSION), userMessage()),
    'transcript.jsonl': records(SESSION, editorStart(SESSION), userMessage()),
    'no-requests.jsonl': jsonl({ kind: 0, v: { version: 3, sessionId: SESSION } }),
    'a-change.jsonl': jsonl({ kind: 1, k: ['requests'], v: [] }),
    'empty.jsonl': '',
  });
  assert.equal(await recognise(join(root, 'chat.jsonl')), 'recognised');
  assert.equal(await recognise(join(root, 'later.jsonl')), 'recognised', 'a version not measured is read as Copilot, and says so (VC2)');
  for (const name of ['runtime/events.jsonl', 'transcript.jsonl', 'no-requests.jsonl', 'a-change.jsonl', 'empty.jsonl', 'runtime']) {
    assert.equal(await recognise(join(root, name)), 'unknown', name);
  }
  assert.equal(await recognise(join(root, 'nothing-here.jsonl')), 'unavailable');
});

test("the runtime's rule is asked first; an input either could not read is unavailable only where neither recognised it", async () => {
  const answer = (value: Recognition) => async (): Promise<Recognition> => value;
  const cases: readonly [Recognition, Recognition, Recognition][] = [
    ['recognised', 'unknown', 'recognised'], ['unknown', 'recognised', 'recognised'], ['unavailable', 'recognised', 'recognised'],
    ['unknown', 'unknown', 'unknown'], ['unavailable', 'unknown', 'unavailable'], ['unknown', 'unavailable', 'unavailable'],
  ];
  for (const [runtime, vsCode, expected] of cases) assert.equal(await recogniseCopilotRecord(answer(runtime), answer(vsCode))('x'), expected, `${runtime} + ${vsCode}`);
});

test("the router reads a VS Code chat log with VS Code's source and anything else with the runtime's", async () => {
  const read: string[] = [];
  const source = (name: string): SessionSource => ({ read: async (input) => { read.push(`${name}:${input}`); return {} as SessionModel; } });
  const router = new CopilotSourceRouter({ runtime: source('runtime'), vsCode: source('vs-code'), isVsCodeChat: async (input) => (input === 'log' ? 'recognised' : 'unknown') });
  await router.read('log');
  await router.read('folder');
  assert.deepEqual(read, ['vs-code:log', 'runtime:folder']);
});
