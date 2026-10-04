// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { access, appendFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { TestContext } from 'node:test';
import { FileOnboardingStore } from '../../src/infrastructure/file-onboarding-store.ts';

async function home(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'agentwhy-onboarding-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

// W21: finished is remembered in the person's home, outside every project, for its owner only.
test('a finished onboarding is appended, and read back for this project', async (t) => {
  const file = join(await home(t), '.agentwhy', 'onboarding.jsonl');
  const store = new FileOnboardingStore(file, '-Users-someone-work-shop');

  assert.deepEqual(await store.read(), { here: false, anywhere: false, failed: false }, 'never finished is not a failure');
  assert.equal(await store.add(1), true);
  assert.equal(await store.add(2), true, 'finishing again appends another line (W25)');

  assert.deepEqual(await store.read(), { here: true, anywhere: true, failed: false });
  assert.match(await readFile(file, 'utf8'), /^\{"kind":"done","project":"-Users-someone-work-shop","at":1\}\n/);
  if (process.platform !== 'win32') {
    assert.equal((await stat(file)).mode & 0o777, 0o600, 'readable by its owner only');
    assert.equal((await stat(dirname(file))).mode & 0o777, 0o700, 'the directory it made is its owner only');
  }
});

// W24, N2: the intro plays once per person, so another project's line is read as well.
test('another project finished is anywhere, and not here', async (t) => {
  const file = join(await home(t), '.agentwhy', 'onboarding.jsonl');
  assert.equal(await new FileOnboardingStore(file, '-Users-someone-work-blog').add(1), true);

  assert.deepEqual(await new FileOnboardingStore(file, '-Users-someone-work-shop').read(), { here: false, anywhere: true, failed: false });
});

test('a project name that could be a path is never written', async (t) => {
  const file = join(await home(t), 'onboarding.jsonl');
  for (const project of ['../x', 'a/b', '', 'a b']) {
    assert.equal(await new FileOnboardingStore(file, project).add(1), false, project);
  }
  await assert.rejects(access(file), 'nothing was written');
});

test('a line that does not hold is skipped', async (t) => {
  const file = join(await home(t), 'onboarding.jsonl');
  await mkdir(dirname(file), { recursive: true });
  await appendFile(
    file,
    'not json\n' +
      '{"kind":"done","project":"../-Users-someone-work-shop","at":1}\n' +
      '{"kind":"other","project":"-Users-someone-work-shop","at":1}\n' +
      '{"kind":"done","project":7,"at":1}\n' +
      'null\n',
  );
  assert.deepEqual(await new FileOnboardingStore(file, '-Users-someone-work-shop').read(), { here: false, anywhere: false, failed: false });

  await appendFile(file, '{"kind":"done","project":"-Users-someone-work-shop","at":3}\n');
  assert.deepEqual(await new FileOnboardingStore(file, '-Users-someone-work-shop').read(), { here: true, anywhere: true, failed: false });
});

// W23: a record that is there and cannot be read is not "never finished".
test('a record that exists and cannot be read is a failure, not a first time', async (t) => {
  const file = join(await home(t), 'onboarding.jsonl');
  await mkdir(file);
  assert.deepEqual(await new FileOnboardingStore(file, '-Users-someone-work-shop').read(), { here: false, anywhere: false, failed: true });
});

// W26: a line that cannot be written is said by the caller; the store does not throw.
test('a record that cannot be written answers false', async (t) => {
  const blocked = join(await home(t), 'not-a-directory');
  await writeFile(blocked, '');
  assert.equal(await new FileOnboardingStore(join(blocked, 'onboarding.jsonl'), '-Users-someone-work-shop').add(1), false);
});

// W25a: an uninstall offers the onboarding again; the intro, once per person, is not played again for it.
test('a reset cancels this project\u2019s finish before it, and a later finish counts again', async (t) => {
  const file = join(await home(t), '.agentwhy', 'onboarding.jsonl');
  const shop = new FileOnboardingStore(file, '-Users-someone-work-shop');
  assert.equal(await shop.add(1), true);
  assert.equal(await shop.reset(2), true);
  assert.deepEqual(await shop.read(), { here: false, anywhere: true, failed: false }, 'offered again, without the intro');
  assert.match(await readFile(file, 'utf8'), /\{"kind":"reset","project":"-Users-someone-work-shop","at":2\}\n$/);

  assert.equal(await shop.add(3), true);
  assert.deepEqual(await shop.read(), { here: true, anywhere: true, failed: false });

  const blog = new FileOnboardingStore(file, '-Users-someone-work-blog');
  assert.equal(await blog.add(4), true);
  assert.equal(await blog.reset(5), true);
  assert.deepEqual(await shop.read(), { here: true, anywhere: true, failed: false }, 'another project\u2019s reset is its own');
  assert.equal(await new FileOnboardingStore(file, '../x').reset(6), false, 'a name that could be a path is never written');
});

// which-project V10: the list of a person's projects asks which of them finished, by the same rule as `here`.
test('which projects finished is read by the rule this project is, a reset after a done included', async (t) => {
  const file = join(await home(t), '.agentwhy', 'onboarding.jsonl');
  const shop = new FileOnboardingStore(file, '-Users-someone-work-shop');
  const blog = new FileOnboardingStore(file, '-Users-someone-work-blog');
  assert.equal(await shop.add(1), true);
  assert.equal(await blog.add(2), true);
  assert.equal(await blog.reset(3), true);

  const done = await shop.doneFor(['-Users-someone-work-shop', '-Users-someone-work-blog', '-Users-someone-work-notes']);
  assert.deepEqual(done === undefined ? undefined : [...done], ['-Users-someone-work-shop']);
  assert.deepEqual([...((await new FileOnboardingStore(join(await home(t), 'none.jsonl'), 'x').doneFor(['x'])) ?? ['failed'])], [], 'no record is no project finished');
});

test('a record that cannot be read says nothing of which projects finished', async (t) => {
  const directory = await home(t);
  // A directory where the file should be: it exists, and cannot be read as one.
  await mkdir(join(directory, 'onboarding.jsonl'));
  assert.equal(await new FileOnboardingStore(join(directory, 'onboarding.jsonl'), 'x').doneFor(['x']), undefined);
});
