// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilePageServers } from '../../src/infrastructure/file-page-servers.ts';

async function folder(t: TestContext): Promise<string> {
  const made = await mkdtemp(join(tmpdir(), 'agentwhy-servers-'));
  t.after(() => rm(made, { recursive: true, force: true }));
  return made;
}

const RECORD = { url: 'http://127.0.0.1:43123/tok/', pid: 4242, startedAt: 1 };

// `2026-10-02-a-page-not-a-file.md` PF2: one record a project, its owner's alone, forgotten only by the process it names.
test('a project\'s running server is remembered for its owner alone, and forgotten only by its own process', async (t) => {
  const home = await folder(t);
  const servers = new FilePageServers(home);

  await servers.write('-Users-someone-shop', RECORD);
  assert.deepEqual(await servers.read('-Users-someone-shop'), RECORD);
  const [file] = await readdir(join(home, 'servers'));
  assert.equal(((await stat(join(home, 'servers', file as string))).mode & 0o777).toString(8), '600');

  await servers.remove('-Users-someone-shop', 9999);
  assert.deepEqual(await servers.read('-Users-someone-shop'), RECORD, 'another process does not forget it');
  await servers.remove('-Users-someone-shop', RECORD.pid);
  assert.equal(await servers.read('-Users-someone-shop'), undefined);
});

test('a record that cannot be read, or holds something else, is no record', async (t) => {
  const home = await folder(t);
  const servers = new FilePageServers(home);
  assert.equal(await servers.read('-Users-someone-none'), undefined);

  await servers.write('-Users-someone-shop', RECORD);
  await writeFile(join(home, 'servers', '-Users-someone-shop.json'), '{"url": 7}');
  assert.equal(await servers.read('-Users-someone-shop'), undefined);
});
