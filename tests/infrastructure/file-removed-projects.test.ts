// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { appendFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { TestContext } from 'node:test';
import { FileRemovedProjects } from '../../src/infrastructure/file-removed-projects.ts';

async function home(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'agentwhy-removed-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

const SHOP = '-Users-someone-work-shop';
const BLOG = '-Users-someone-work-blog';

// RM6: the person's own record, outside every project, for its owner only.
test('a removed project is appended, and read back among the names asked for', async (t) => {
  const file = join(await home(t), '.agentwhy', 'removed-projects.jsonl');
  const record = new FileRemovedProjects(file);

  assert.deepEqual([...((await record.removedFrom([SHOP, BLOG])) ?? [])], [], 'nothing removed is not a failure');
  assert.equal(await record.remove(SHOP, 1), true);

  assert.deepEqual([...((await record.removedFrom([SHOP, BLOG])) ?? [])], [SHOP]);
  assert.equal(await readFile(file, 'utf8'), `{"kind":"removed","project":"${SHOP}","at":1}\n`);
  if (process.platform !== 'win32') {
    assert.equal((await stat(file)).mode & 0o777, 0o600, 'readable by its owner only');
    assert.equal((await stat(dirname(file))).mode & 0o777, 0o700, 'the directory it made is its owner only');
  }
});

// RM11: no page puts a project back, and the last word for a project is still the one that counts - a `kept` line a
// person wrote by hand lists it again, and a removal after it counts.
test('the last word for a project counts, so a kept line lists it again', async (t) => {
  const file = join(await home(t), 'removed-projects.jsonl');
  const record = new FileRemovedProjects(file);

  assert.equal(await record.remove(SHOP, 1), true);
  await appendFile(file, JSON.stringify({ kind: 'kept', project: SHOP, at: 2 }) + '\n', 'utf8');
  assert.deepEqual([...((await record.removedFrom([SHOP])) ?? [])], [], 'kept cancels the removal before it');

  assert.equal(await record.remove(SHOP, 3), true);
  assert.deepEqual([...((await record.removedFrom([SHOP])) ?? [])], [SHOP], 'and a later removal counts again');
});

test('a project name that could be a path is never written', async (t) => {
  const record = new FileRemovedProjects(join(await home(t), 'removed-projects.jsonl'));
  for (const project of ['../x', 'a/b', '', 'a b']) {
    assert.equal(await record.remove(project, 1), false, project);
  }
});

// Read from a file a person could have edited: RM13 says nothing is guessed past, and no line is trusted.
test('a line that does not hold is skipped, and the rest of the record still counts', async (t) => {
  const file = join(await home(t), 'removed-projects.jsonl');
  await writeFile(file, [
    'not json',
    '[]',
    '{"kind":"removed"}',
    '{"kind":"removed","project":"../escape","at":1}',
    '{"kind":"what","project":"' + BLOG + '","at":1}',
    `{"kind":"removed","project":"${SHOP}","at":2}`,
    '',
  ].join('\n'), 'utf8');

  assert.deepEqual([...((await new FileRemovedProjects(file).removedFrom([SHOP, BLOG, '../escape'])) ?? [])], [SHOP]);
});

// RM13: a record that is there and cannot be read hides nothing at all.
test('a record that cannot be read answers nothing known, not an empty list', async (t) => {
  const directory = await home(t);
  assert.equal(await new FileRemovedProjects(directory).removedFrom([SHOP]), undefined, 'a directory in its place');
});
