import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { appendFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { TestContext } from 'node:test';
import { FileCheckedStore } from '../../src/infrastructure/file-checked-store.ts';

async function home(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'agentwhy-checked-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

// F55: a conversation asked for once is remembered beside the marks, outside every project, for its owner only.
test('a conversation asked for is appended, and read back as remembered', async (t) => {
  const file = join(await home(t), '.agentwhy', 'projects', '-work-app', 'checked.jsonl');
  const store = new FileCheckedStore(file);

  assert.deepEqual(await store.read(), { ids: new Set(), failed: false }, 'never asked is not a failure');
  assert.equal(await store.add('951c4f76-9d2a-40d2-9c76-1e57cf47ae4e', 1), true);
  assert.equal(await store.add('951c4f76-9d2a-40d2-9c76-1e57cf47ae4e', 2), true);

  assert.deepEqual([...(await store.read()).ids], ['951c4f76-9d2a-40d2-9c76-1e57cf47ae4e']);
  assert.match(await readFile(file, 'utf8'), /^\{"kind":"checked","id":"951c4f76-9d2a-40d2-9c76-1e57cf47ae4e","at":1\}\n/);
  if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600, 'readable by its owner only');
});

test('an id that could be a path is never written, and a line that does not hold is skipped', async (t) => {
  const file = join(await home(t), 'checked.jsonl');
  const store = new FileCheckedStore(file);
  assert.equal(await store.add('../../etc/passwd', 1), false);

  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, 'not json\n{"kind":"checked","id":"../x","at":1}\n{"kind":"other","id":"a","at":1}\n{"kind":"checked","id":"ok-1","at":3}\n');
  assert.deepEqual([...(await store.read()).ids], ['ok-1']);
});
