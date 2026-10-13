// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { headerOf, readHeader } from '../../../../src/adapter/copilot/discovery/session-header.ts';
import { FileAccessError } from '../../../../src/ports/file-access-error.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';
import { PROJECT, SESSION, editorStart, records, sessionStart } from '../../../helpers/copilot-session.ts';

const firstLine = (...drafts: Parameters<typeof records>[1][]): string => records(SESSION, ...drafts).split('\n')[0] ?? '';

test('the runtime\'s first line is recognised, with its id, build and folder (CP1, CP1a)', () => {
  assert.deepEqual(headerOf(firstLine(sessionStart(SESSION))), { sessionId: SESSION, version: '1.0.94', project: PROJECT });
});

test('VS Code\'s transcript shares the type and producer and is not recognised (CP1a)', () => {
  assert.equal(headerOf(firstLine(editorStart(SESSION))), undefined);
});

test('a first line with both marks, or neither, is no format\'s - never the nearer one', () => {
  assert.equal(headerOf(firstLine(sessionStart(SESSION, { vscodeVersion: '1.139.0' }))), undefined, 'both');
  const neither = JSON.parse(firstLine(sessionStart(SESSION))) as { data: Record<string, unknown> };
  delete neither.data.context;
  assert.equal(headerOf(JSON.stringify(neither)), undefined, 'neither');
});

test('a first line of another type, producer or shape is not recognised', () => {
  assert.equal(headerOf(firstLine({ type: 'user.message', data: {} })), undefined);
  assert.equal(headerOf(firstLine(sessionStart(SESSION, { producer: 'another' }))), undefined);
  assert.equal(headerOf(firstLine(sessionStart(SESSION, { sessionId: '' }))), undefined);
  assert.equal(headerOf(firstLine(sessionStart(SESSION, { sessionId: 7 }))), undefined);
  assert.equal(headerOf('not json'), undefined);
  assert.equal(headerOf(''), undefined);
});

test('a folder that is not a string, or empty, is no project and no reason to refuse the session', () => {
  assert.deepEqual(headerOf(firstLine(sessionStart(SESSION, { context: { cwd: 3 } }))), { sessionId: SESSION, version: '1.0.94' });
  assert.deepEqual(headerOf(firstLine(sessionStart(SESSION, { context: { cwd: '' }, copilotVersion: 2 }))), { sessionId: SESSION });
});

test('reading a header reads the first line alone and closes the file', async () => {
  let closed = false;
  const reader: FileReader = {
    async readText() { throw new Error('whole-file reading is forbidden for a header'); },
    async *readLines() {
      try {
        yield firstLine(sessionStart(SESSION));
        throw new Error('read past the first line');
      } finally {
        closed = true;
      }
    },
  };
  const read = await readHeader(reader, '/Users/someone/.copilot/session-state/x/events.jsonl');
  assert.equal(read.kind, 'recognised');
  assert.equal(closed, true);
});

test('a file the port cannot reach is unavailable, with why; an empty file is unknown', async () => {
  const missing: FileReader = {
    async readText() { throw new Error('unused'); },
    async *readLines(path) { throw new FileAccessError('not-found', path); },
  };
  assert.deepEqual(await readHeader(missing, '/x'), { kind: 'unavailable', failure: 'not-found' });
  const empty: FileReader = { async readText() { return ''; }, async *readLines() {} };
  assert.deepEqual(await readHeader(empty, '/x'), { kind: 'unknown' });
});
