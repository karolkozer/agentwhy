// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStartNoteStore } from '../../src/infrastructure/file-start-note-store.ts';

async function folder(t: { after: (fn: () => Promise<void>) => void }): Promise<string> {
  const made = await mkdtemp(join(tmpdir(), 'agentwhy-start-notes-'));
  t.after(() => rm(made, { recursive: true, force: true }));
  return made;
}

test('a record that is not there is never told; one written holds the latest moment for each project', async (t) => {
  const file = join(await folder(t), '.agentwhy', 'plugin-said.jsonl');
  const store = new FileStartNoteStore(file);

  assert.equal(await store.lastToldAt('-Users-someone-blog'), undefined);
  assert.equal(await store.add('-Users-someone-blog', 100), true);
  assert.equal(await store.add('-Users-someone-blog', 300), true);
  assert.equal(await store.add('-Users-someone-shop', 200), true);

  assert.equal(await store.lastToldAt('-Users-someone-blog'), 300);
  assert.equal(await store.lastToldAt('-Users-someone-shop'), 200);
  assert.equal((await stat(file)).mode & 0o777, 0o600, 'readable by the person alone');
  assert.deepEqual((await readFile(file, 'utf8')).trim().split('\n').map((line) => Object.keys(JSON.parse(line) as object)), [['project', 'at'], ['project', 'at'], ['project', 'at']], 'a name and a moment, nothing else');
});

test('a line that does not hold is skipped, and a name that could be a path is never written', async (t) => {
  const file = join(await folder(t), 'plugin-said.jsonl');
  await writeFile(file, ['not json', '{"project":"-Users-someone-blog","at":"soon"}', '{"project":"-Users-someone-blog","at":50}', ''].join('\n'));
  const store = new FileStartNoteStore(file);

  assert.equal(await store.lastToldAt('-Users-someone-blog'), 50);
  assert.equal(await store.add('../elsewhere', 60), false);
  assert.equal(await store.lastToldAt('../elsewhere'), undefined);
});

test('a record that is there and cannot be read is failed, not never', async (t) => {
  const file = join(await folder(t), 'plugin-said.jsonl');
  await mkdir(file);

  assert.equal(await new FileStartNoteStore(file).lastToldAt('-Users-someone-blog'), 'failed');
});
