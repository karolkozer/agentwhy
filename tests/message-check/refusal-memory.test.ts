// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { AlertStore, RememberedAlert } from '../../src/ports/alert-store.ts';
import { refusalMemory } from '../../src/message-check/refusal-memory.ts';

test('PK10: the note is kept under a key of its own, so the session\'s own alerts never take it, and taken once', async () => {
  const files = new Map<string, RememberedAlert[]>();
  const store: AlertStore = {
    remember: async (id, alert) => { files.set(id, [...(files.get(id) ?? []).filter((a) => a.agentId !== alert.agentId), alert]); },
    take: async (id) => { const all = files.get(id) ?? []; files.delete(id); return all; },
    peek: async (id) => files.get(id) ?? [],
  };
  const memory = refusalMemory(store);
  await memory.keep('session-1', 'first');
  await memory.keep('session-1', 'second');
  assert.deepEqual(await store.take('session-1'), [], 'Stop takes the session\'s alerts and finds none of it');
  assert.equal(await memory.take('session-1'), 'second', 'a second refusal replaces the first');
  assert.equal(await memory.take('session-1'), undefined);
});

test('PK11: a message that went is marked beside the note, and taking the note leaves the mark', async () => {
  const files = new Map<string, RememberedAlert[]>();
  const store: AlertStore = {
    remember: async (id, alert) => { files.set(id, [...(files.get(id) ?? []).filter((a) => a.agentId !== alert.agentId), alert]); },
    take: async (id) => { const all = files.get(id) ?? []; files.delete(id); return all; },
    peek: async (id) => files.get(id) ?? [],
  };
  const memory = refusalMemory(store);
  assert.equal(await memory.wentBefore('s'), false);
  await memory.markWent('s');
  await memory.keep('s', 'note');
  assert.equal(await memory.take('s'), 'note');
  assert.equal(await memory.wentBefore('s'), true);
  assert.deepEqual(await store.take('s'), []);
});
