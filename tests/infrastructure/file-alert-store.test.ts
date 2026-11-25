// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { FileAlertStore } from '../../src/infrastructure/file-alert-store.ts';

const DIRECTORY = 'agentwhy-alerts';
/** Where one record of a session is kept: the session, and what it is kept under. */
const recordOf = (temporary: string, sessionId: string, name: string): string => join(temporary, DIRECTORY, `${sessionId}@${name}.json`);
/** Records as another version, or another hand, left them: one file each, whatever they hold. */
async function written(temporary: string, sessionId: string, records: readonly unknown[]): Promise<void> {
  for (const [at, record] of records.entries()) await writeFile(recordOf(temporary, sessionId, `r-${at}`), JSON.stringify(record), 'utf8');
}
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

// `when-an-agent-finishes` R4a: asking whether something was said must not be what forgets it.
test('a look at what is remembered leaves it for the turn that says it', async (t) => {
  const { store } = await storeIn(t);

  await store.remember('s-1', alert('a-1'));

  assert.deepEqual(await store.peek('s-1'), [alert('a-1')]);
  assert.deepEqual(await store.take('s-1'), [alert('a-1')]);
  assert.deepEqual(await store.peek('s-1'), []);
});

// B4j: a turn's `Stop` reads the conversation for seconds, and what was said before must be there for a hook that asks
// in between. Only what the turn says is forgotten.
test('what a run leaves is handed over and stays, and the rest is forgotten', async (t) => {
  const { store } = await storeIn(t);
  const said = { agentId: 'session:no-record', level: 'no-record', words: '' };
  await store.remember('s-1', said);
  await store.remember('s-1', alert('a-1'));

  assert.deepEqual(await store.take('s-1', ['session:no-record', 'session:clean']), [alert('a-1'), said]);
  assert.deepEqual(await store.peek('s-1'), [said]);

  await store.forget('s-1', 'session:no-record');
  await store.forget('s-1', 'session:no-record');
  assert.deepEqual(await store.peek('s-1'), [], 'and one record is forgotten by its name, there or not');
});

// A conversation that goes on for days says its line once: its records used to be written again at the end of each turn,
// and left where they are they would be swept a day after they were first said.
test('what a run leaves is kept for as long as the conversation goes on', async (t) => {
  const { store, temporary } = await storeIn(t);
  await store.remember('s-1', alert('session:clean'));
  const file = recordOf(temporary, 's-1', 'session-clean');
  const longAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await utimes(file, longAgo, longAgo);

  await store.take('s-1', ['session:clean']);
  await store.remember('s-2', alert('a-2'));

  assert.deepEqual(await store.peek('s-1'), [alert('session:clean')]);
});

// Claude Code starts a hook of its own for each helper that finishes, side by side. Run as two processes over one file for
// the session, 30 of 30 pairs kept one of the two findings; the other was never said.
test('alerts remembered at the same moment are all kept', async (t) => {
  const { store, temporary } = await storeIn(t);
  const names = Array.from({ length: 20 }, (_, at) => `a-${String(at).padStart(2, '0')}`);

  await Promise.all(names.map((name) => new FileAlertStore(temporary, process.getuid?.()).remember('s-1', alert(name))));

  assert.deepEqual((await store.take('s-1')).map((remembered) => remembered.agentId), names);
  assert.deepEqual(await readdir(join(temporary, DIRECTORY)), [], 'and nothing half-written or claimed is left behind');
});

test('runs that take at the same moment are handed each alert once between them', async (t) => {
  const { store, temporary } = await storeIn(t);
  for (const name of ['a-1', 'a-2', 'a-3']) await store.remember('s-1', alert(name));

  const taken = await Promise.all(Array.from({ length: 5 }, () => new FileAlertStore(temporary, process.getuid?.()).take('s-1')));

  assert.deepEqual(taken.flat().map((remembered) => remembered.agentId).sort(), ['a-1', 'a-2', 'a-3']);
});

// An alert is whole or not there: a run that takes while another writes the same agent's words again is handed the old
// words or the new, and the new are still there where it was handed the old.
test('an alert written again while it is taken is not lost', async (t) => {
  const { store, temporary } = await storeIn(t);
  for (let round = 0; round < 50; round++) {
    await store.remember('s-1', alert('a-1', 'first'));
    const other = new FileAlertStore(temporary, process.getuid?.());
    const [taken] = await Promise.all([store.take('s-1'), other.remember('s-1', alert('a-1', 'second'))]);
    const left = await store.take('s-1');
    assert.ok([...taken, ...left].some((remembered) => remembered.words === 'second'), `round ${round}`);
    assert.ok(taken.length === 1, `round ${round}`);
  }
});

test('of runs that ask at the same moment, one is told to say it, and none after them', async (t) => {
  const { store, temporary } = await storeIn(t);
  const said = { agentId: 'session:no-record', level: 'no-record', words: '' };

  const asked = await Promise.all(Array.from({ length: 8 }, () => new FileAlertStore(temporary, process.getuid?.()).rememberOnce('s-1', said)));

  assert.equal(asked.filter(Boolean).length, 1);
  assert.equal(await store.rememberOnce('s-1', said), false);
  assert.equal(await store.rememberOnce('s-2', said), true, 'another session has a once of its own');
  assert.deepEqual(await store.peek('s-1'), [said]);
});

// Said again is better than never said: where nothing can be kept, nothing was said before.
test('a store that cannot write answers that it is to be said', async (t) => {
  const { temporary } = await storeIn(t);
  const nowhere = new FileAlertStore(join(temporary, 'a-file'), process.getuid?.());
  await writeFile(join(temporary, 'a-file'), 'not a directory', 'utf8');

  const said = { agentId: 'session:no-record', level: 'no-record', words: '' };
  assert.deepEqual([await nowhere.rememberOnce('s-1', said), await nowhere.rememberOnce('s-1', said)], [true, true]);
  assert.deepEqual(await nowhere.take('s-1', ['session:no-record']), []);
  await nowhere.forget('s-1', 'session:no-record');
});

// `refusalMemory` keeps its note under a key of its own beside the session's, and the two are never read as one.
test('a session whose id begins as another\'s is not read as part of it', async (t) => {
  const { store } = await storeIn(t);
  await store.remember('s-1.refused-message', alert('refused-message'));
  await store.remember('s-1-2', alert('a-2'));

  assert.deepEqual(await store.take('s-1'), []);
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
  const file = recordOf(temporary, 'old', 'a-old');
  const longAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await utimes(file, longAgo, longAgo);

  // Pruning happens on the next write, so a session that is still going does the sweeping.
  await store.remember('new', alert('a-new'));

  assert.deepEqual(await readdir(join(temporary, DIRECTORY)), ['new@a-new.json']);
});

// A hook must not fail, so every unreadable state is an empty answer rather than an exception.
test('a file that is not a record reads as nothing at all', async (t) => {
  const { store, temporary } = await storeIn(t);
  await store.remember('s-1', alert('a-1'));
  await writeFile(recordOf(temporary, 's-1', 'a-1'), '{ not json', 'utf8');

  assert.deepEqual(await store.take('s-1'), []);
});

test('a record of the wrong shape is skipped, and its neighbour is not', async (t) => {
  const { store, temporary } = await storeIn(t);
  await store.remember('s-1', alert('a-1'));
  await writeFile(recordOf(temporary, 's-1', 'a-2'), JSON.stringify({ agentId: 'a-2' }), 'utf8');

  assert.deepEqual(await store.take('s-1'), [alert('a-1')]);
});

// A session id arrives from a hook input, so it names a file only after it has been made safe.
test('a session id cannot name a path of its own', async (t) => {
  const { store, temporary } = await storeIn(t);

  await store.remember('../../escaped', alert('a-1'));
  await store.remember('', alert('a-2'));

  // The separators are gone, so the name stays a name: it is written in the store's own directory and nowhere else.
  const names = await readdir(join(temporary, DIRECTORY));
  assert.deepEqual(names.sort(), ['..-..-escaped@a-1.json', 'session@a-2.json']);
  assert.deepEqual(await store.take('../../escaped'), [alert('a-1')], 'and the same id still finds it');
});

// R7: the file holds the words a notification shows, and nothing else about the session.
test('the file holds an id, a level and the words, and no other field', async (t) => {
  const { store, temporary } = await storeIn(t);

  await store.remember('s-1', alert('a-1'));

  const onDisk: unknown = JSON.parse(await readFile(recordOf(temporary, 's-1', 'a-1'), 'utf8'));
  assert.deepEqual(Object.keys(onDisk as Record<string, unknown>).sort(), ['agentId', 'level', 'words']);
});

test('nothing remembered is an empty answer, not a failure', async (t) => {
  const { store } = await storeIn(t);

  assert.deepEqual(await store.take('never-seen'), []);
});

// `.ai/specs/2026-10-01-who-stopped-it.md` WS5: that a rule did not refuse everything is kept as a flag and no count, and
// a flag of another shape is a record this store did not write.
test('a refusal not every rule made is remembered as one flag, and a flag of another shape is skipped', async (t) => {
  const { store, temporary } = await storeIn(t);
  const stopped = { agentId: 'a-1', level: 'refused', words: 'NOTE: 1 attempt at protected files was stopped.', notByRule: true as const };

  await store.remember('s-1', stopped);
  const onDisk: unknown = JSON.parse(await readFile(recordOf(temporary, 's-1', 'a-1'), 'utf8'));
  assert.deepEqual(Object.keys(onDisk as Record<string, unknown>).sort(), ['agentId', 'level', 'notByRule', 'words']);
  assert.deepEqual(await store.take('s-1'), [stopped]);

  await written(temporary, 's-2', [{ ...stopped, notByRule: 'yes' }, alert('a-2')]);
  assert.deepEqual(await store.take('s-2'), [alert('a-2')]);
});

// F57a, found by review: a read the person allowed is kept as a flag and a count of its own, so it is never said as a key
// later; counts written before it have none, and read as none.
test('a read the person allowed, and private data, are remembered apart, and counts from before them are still read', async (t) => {
  const { store, temporary } = await storeIn(t);
  const told = { agentId: 'session:own', level: 'value', words: 'Your AI read one you let it read.', told: true as const };
  const data = { agentId: 'session:other', level: 'value', words: 'Private data from one of them.', data: true as const };
  const counts = { agentId: 'session:counts', level: 'counts', words: '', counts: { values: 0, reached: 0, told: 2, data: 1 } };

  await store.remember('s-1', told);
  await store.remember('s-1', data);
  await store.remember('s-1', counts);
  assert.deepEqual(await store.take('s-1'), [counts, data, told]);

  const before = { ...counts, counts: { values: 1, reached: 0 } };
  await written(temporary, 's-2', [
    before, { ...told, told: 'yes' }, { ...data, data: 1 }, { ...counts, counts: { values: 0, reached: 0, told: 'two' } },
  ]);
  assert.deepEqual(await store.take('s-2'), [before]);
});

// S20 `name`, 2026-10-10: names seen alone are remembered as such, and counted apart, so a later quiet turn never says
// a file was opened; a flag or a count of another shape is skipped as every other is.
test('names seen alone are remembered with their flag and their count, and one of another shape is skipped', async (t) => {
  const { store, temporary } = await storeIn(t);
  const named = { agentId: 'session:said', level: 'reached', words: 'Your AI only saw the name of one of them.', named: true as const };
  const counts = { agentId: 'session:counts', level: 'counts', words: '', counts: { values: 0, reached: 0, named: 1 } };

  await store.remember('s-1', named);
  await store.remember('s-1', counts);
  assert.deepEqual(await store.take('s-1'), [counts, named]);

  await written(temporary, 's-2', [
    { ...named, named: 'yes' }, { ...counts, counts: { values: 0, reached: 0, named: 'one' } }, counts,
  ]);
  assert.deepEqual(await store.take('s-2'), [counts]);
});

// 2026-10-10: a stop said once is remembered as one, and counted apart, so a later quiet turn is not the first.
test('a stop is remembered with its flag and its count, and one of another shape is skipped', async (t) => {
  const { store, temporary } = await storeIn(t);
  const stopped = { agentId: 'session:said', level: 'refused', words: 'I kept your AI from reading one of them.', stopped: true as const };
  const counts = { agentId: 'session:counts', level: 'counts', words: '', counts: { values: 0, reached: 0, stopped: 1 } };
  await store.remember('s-1', stopped);
  await store.remember('s-1', counts);
  assert.deepEqual(await store.take('s-1'), [counts, stopped]);
  await written(temporary, 's-2', [{ ...stopped, stopped: 1 }, counts]);
  assert.deepEqual(await store.take('s-2'), [counts]);
});
