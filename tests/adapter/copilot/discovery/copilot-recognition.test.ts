// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { recogniseCopilot } from '../../../../src/adapter/copilot/discovery/copilot-recognition.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { writeSession } from '../../../helpers/synthetic-session.ts';
import { SESSION, editorStart, records, sessionStart, userMessage } from '../../../helpers/copilot-session.ts';

const files = new NodeFileSystem();
const recognise = (input: string) => recogniseCopilot(files, files, input);

test('a session\'s file and its folder are recognised by the first line alone (CP1, CP1a)', async (t) => {
  const root = await writeSession(t, { [`${SESSION}/events.jsonl`]: records(SESSION, sessionStart(SESSION), userMessage()) });
  assert.equal(await recognise(join(root, SESSION, 'events.jsonl')), 'recognised');
  assert.equal(await recognise(join(root, SESSION)), 'recognised');
  assert.equal(await recognise(root), 'recognised', 'a folder holding a session, as ~/.copilot/session-state holds them');
});

test('a VS Code transcript, a folder with no session and another file are not Copilot\'s', async (t) => {
  const root = await writeSession(t, {
    'transcript.jsonl': records(SESSION, editorStart(SESSION)),
    'empty-folder/notes.txt': 'x',
    'other.jsonl': '{"type":"user"}\n',
  });
  assert.equal(await recognise(join(root, 'transcript.jsonl')), 'unknown');
  assert.equal(await recognise(join(root, 'empty-folder')), 'unknown');
  assert.equal(await recognise(join(root, 'other.jsonl')), 'unknown');
  assert.equal(await recognise(root), 'unknown', 'a folder whose folders hold no runtime session');
});

test('a folder whose session folder holds a VS Code transcript is not Copilot\'s either (CP1a)', async (t) => {
  const root = await writeSession(t, { [`${SESSION}/events.jsonl`]: records(SESSION, editorStart(SESSION)) });
  assert.equal(await recognise(root), 'unknown');
});

test('an input that is not there is unavailable, not unknown', async (t) => {
  const root = await writeSession(t, {});
  assert.equal(await recognise(join(root, 'missing.jsonl')), 'unavailable');
});
