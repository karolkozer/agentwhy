import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { FileAlertStore } from '../../src/infrastructure/file-alert-store.ts';

const DIRECTORY = 'agentwhy-alerts';
const alert = (agentId: string, words = 'An Explore agent wrote a value from a protected file.') => ({
  agentId,
  level: 'value',
  words,
});

async function storeIn(t: TestContext, now = Date.now): Promise<{ store: FileAlertStore; temporary: string }> {
  const temporary = await mkdtemp(join(tmpdir(), 'agentwhy-store-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  // The account this test runs as: the store refuses a directory that is not its own, as it does in the shell.
  return { store: new FileAlertStore(temporary, process.getuid?.(), now), temporary };
}

// R7: written when the finding is made, read once when it is said.
test('what is remembered is handed over once, and then forgotten', async (t) => {
  const { store } = await storeIn(t);

  await store.remember('s-1', alert('a-1'));

  assert.deepEqual(await store.take('s-1'), [alert('a-1')]);
  assert.deepEqual(await store.take('s-1'), [], 'a turn does not say the same notice twice');
});

// R8, and the measured reason for it: SubagentStop fired three times for one finished agent (B5h).
test('the same agent is remembered once, however many times its hook fires', async (t) => {
  const { store } = await storeIn(t);

  await store.remember('s-1', alert('a-1'));
  await store.remember('s-1', alert('a-1', 'the same agent, said again'));
  await store.remember('s-1', alert('a-2'));

  const taken = await store.take('s-1');
  assert.deepEqual(taken.map((remembered) => remembered.agentId), ['a-1', 'a-2'], 'one record per agent');
  assert.equal(taken.find((remembered) => remembered.agentId === 'a-1')?.words, 'the same agent, said again', 'the last words win');
});

test('one session cannot read or clear another session\'s alerts', async (t) => {
  const { store } = await storeIn(t);

  await store.remember('s-1', alert('a-1'));
  await store.remember('s-2', alert('a-2'));

  assert.deepEqual(await store.take('s-2'), [alert('a-2')]);
  assert.deepEqual(await store.take('s-1'), [alert('a-1')], 'taking one leaves the other');
});

test('a session that never finished is swept by age, and a fresh one is left alone', async (t) => {
  const { store, temporary } = await storeIn(t);
  await store.remember('old', alert('a-old'));
  const file = join(temporary, DIRECTORY, 'old.json');
  const longAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await utimes(file, longAgo, longAgo);

  // Pruning happens on the next write, so a session that is still going does the sweeping.
  await store.remember('new', alert('a-new'));

  assert.deepEqual(await readdir(join(temporary, DIRECTORY)), ['new.json']);
});

// A hook must not fail, so every unreadable state is an empty answer rather than an exception.
test('a file that is not a record reads as nothing at all', async (t) => {
  const { store, temporary } = await storeIn(t);
  await store.remember('s-1', alert('a-1'));
  await writeFile(join(temporary, DIRECTORY, 's-1.json'), '{ not json', 'utf8');

  assert.deepEqual(await store.take('s-1'), []);
});

test('a record of the wrong shape is skipped, and its neighbour is not', async (t) => {
  const { store, temporary } = await storeIn(t);
  await store.remember('s-1', alert('a-1'));
  const file = join(temporary, DIRECTORY, 's-1.json');
  await writeFile(file, JSON.stringify([{ agentId: 'a-2' }, alert('a-1')]), 'utf8');

  assert.deepEqual(await store.take('s-1'), [alert('a-1')]);
});

// A session id arrives from a hook input, so it names a file only after it has been made safe.
test('a session id cannot name a path of its own', async (t) => {
  const { store, temporary } = await storeIn(t);

  await store.remember('../../escaped', alert('a-1'));
  await store.remember('', alert('a-2'));

  // The separators are gone, so the name stays a name: it is written in the store's own directory and nowhere else.
  const written = await readdir(join(temporary, DIRECTORY));
  assert.deepEqual(written.sort(), ['..-..-escaped.json', 'session.json']);
  assert.deepEqual(await store.take('../../escaped'), [alert('a-1')], 'and the same id still finds it');
});

// R7: the file holds the words a notification shows, and nothing else about the session.
test('the file holds an id, a level and the words, and no other field', async (t) => {
  const { store, temporary } = await storeIn(t);

  await store.remember('s-1', alert('a-1'));

  const written: unknown = JSON.parse(await readFile(join(temporary, DIRECTORY, 's-1.json'), 'utf8'));
  assert.deepEqual((written as Record<string, unknown>[]).map((record) => Object.keys(record).sort()), [['agentId', 'level', 'words']]);
});

test('nothing remembered is an empty answer, not a failure', async (t) => {
  const { store } = await storeIn(t);

  assert.deepEqual(await store.take('never-seen'), []);
});
