import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { appendFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { FileMarkStore } from '../../src/infrastructure/file-mark-store.ts';
import type { MarkRecord } from '../../src/ports/mark-store.ts';

async function home(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'agentwhy-marks-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

const MARK: MarkRecord = { kind: 'mark', path: '.env', label: 'rotate', result: 'rotated', at: 1, note: 'new keys', sessions: ['s-1'] };

// R33, R34: appended as lines, in a directory created on the first mark, and read back whole.
test('a mark is appended as a line, and read back in order', async (t) => {
  const file = join(await home(t), '.agentwhy', 'projects', '-work-app', 'marks.jsonl');
  const store = new FileMarkStore(file);

  assert.equal(await store.append(MARK), true);
  assert.equal(await store.append({ kind: 'unmark', path: '.env', at: 2 }), true);

  assert.deepEqual(await store.read(), { records: [MARK, { kind: 'unmark', path: '.env', at: 2 }], skipped: 0, failed: false });
  assert.equal((await readFile(file, 'utf8')).split('\n').length, 3, 'two lines and the newline after the last');
  if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600, 'readable by its owner only');
});

test('nothing marked yet is an empty record, not a failure', async (t) => {
  const store = new FileMarkStore(join(await home(t), 'marks.jsonl'));

  assert.deepEqual(await store.read(), { records: [], skipped: 0, failed: false });
});

// A person can edit the file; a line this version cannot read is skipped and counted, never fatal.
test('a line that is not a record is skipped and counted', async (t) => {
  const file = join(await home(t), 'marks.jsonl');
  await appendFile(file, JSON.stringify(MARK) + '\nnot json\n{"kind":"mark","path":".env"}\n\n');

  const reading = await new FileMarkStore(file).read();

  assert.deepEqual(reading.records, [MARK]);
  assert.equal(reading.skipped, 2);
});

test('a record that exists and cannot be read says so, and a mark that cannot be written answers false', async (t) => {
  const directory = join(await home(t), 'marks.jsonl');
  await mkdir(directory);
  const store = new FileMarkStore(directory);

  assert.equal((await store.read()).failed, true);
  assert.equal(await store.append(MARK), false);
});

// F25, F50: the report page's results are read back like the first two; a result this version does not know is not.
test('a mark of handled or not private is read back, and one of an unknown result is skipped', async (t) => {
  const file = join(await home(t), 'marks.jsonl');
  const handled: MarkRecord = { ...MARK, path: 'data/customers.csv', result: 'handled' };
  const notPrivate: MarkRecord = { ...MARK, path: 'notes.csv', result: 'not-private' };
  await appendFile(file, [handled, notPrivate, { ...MARK, result: 'deleted' }].map((line) => JSON.stringify(line)).join('\n') + '\n');

  const reading = await new FileMarkStore(file).read();

  assert.deepEqual(reading.records, [handled, notPrivate]);
  assert.equal(reading.skipped, 1);
});
