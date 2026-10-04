// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.ts';
import { FileAccessError, type AccessFailure } from '../../src/ports/file-access-error.ts';

const files = new NodeFileSystem();

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'agentwhy-fs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'dir'));
  await writeFile(join(root, 'dir', 'a.txt'), 'first\nsecond\r\nthird');
  await writeFile(join(root, 'carriage-return.jsonl'), '{"a":1,\r"b":2}\n{"c":3}\n');
  return root;
}

async function failureOf(operation: () => Promise<unknown>): Promise<AccessFailure | undefined> {
  try {
    await operation();
    return undefined;
  } catch (error) {
    assert.ok(error instanceof FileAccessError, `expected a FileAccessError, got ${String(error)}`);
    return error.failure;
  }
}

async function drain(lines: AsyncIterable<string>): Promise<string[]> {
  const collected: string[] = [];
  for await (const line of lines) collected.push(line);
  return collected;
}

// A session title sits near the end of a transcript of any size; reading the whole file to find it would cost the size.
test('reads the end of a file by position, and the whole of a shorter one', async (t) => {
  const root = await workspace(t);
  const path = join(root, 'tail.jsonl');
  await writeFile(path, '{"a":1}\n{"b":2}\n{"c":3}\n');

  assert.equal(await files.readTail(path, 8), '{"c":3}\n');
  assert.equal(await files.readTail(path, 1024), '{"a":1}\n{"b":2}\n{"c":3}\n');
  assert.equal(await failureOf(() => files.readTail(join(root, 'missing.jsonl'), 8)), 'not-found');
});

test('reports entry kinds and lists a directory with the kind of each entry', async (t) => {
  const root = await workspace(t);

  assert.equal(await files.kindOf(join(root, 'dir')), 'directory');
  assert.equal(await files.kindOf(join(root, 'dir', 'a.txt')), 'file');
  assert.deepEqual(await files.list(join(root, 'dir')), [{ name: 'a.txt', kind: 'file' }]);
});

test('reads text as is, and lines without their terminators', async (t) => {
  const path = join(await workspace(t), 'dir', 'a.txt');

  assert.equal(await files.readText(path), 'first\nsecond\r\nthird');
  assert.deepEqual(await drain(files.readLines(path)), ['first', 'second', 'third']);
});

// A \r inside a JSON record is whitespace between tokens, not a line break. Splitting there would turn one valid
// record into two unparsable halves - which is exactly what a measured session showed.
test('a carriage return inside a record does not end the line', async (t) => {
  const path = join(await workspace(t), 'carriage-return.jsonl');

  const lines = await drain(files.readLines(path));

  assert.deepEqual(lines, ['{"a":1,\r"b":2}', '{"c":3}']);
  assert.deepEqual(lines.map((line) => JSON.parse(line)), [{ a: 1, b: 2 }, { c: 3 }]);
});

test('reads a last line that has no terminator', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, 'no-newline.jsonl'), '{"a":1}\n{"b":2}');

  assert.deepEqual(await drain(files.readLines(join(root, 'no-newline.jsonl'))), ['{"a":1}', '{"b":2}']);
});

test('turns a missing path into a not-found FileAccessError in every operation', async (t) => {
  const missing = join(await workspace(t), 'missing');

  assert.equal(await failureOf(() => files.kindOf(missing)), 'not-found');
  assert.equal(await failureOf(() => files.list(missing)), 'not-found');
  assert.equal(await failureOf(() => files.readText(missing)), 'not-found');
  assert.equal(await failureOf(() => drain(files.readLines(missing))), 'not-found');
});

// `report --input` given a folder of Codex rollouts, which `doctor` takes, ended in "unexpected error: EISDIR".
test('turns a folder read as a file into an unreadable FileAccessError', async (t) => {
  const folder = join(await workspace(t), 'dir');

  assert.equal(await failureOf(() => files.readText(folder)), 'unreadable');
  assert.equal(await failureOf(() => drain(files.readLines(folder))), 'unreadable');
});

const PERMISSIONS_RESTRICT_USER = process.platform !== 'win32' && process.getuid?.() !== 0;

// The real-OS behaviour that tests/helpers/faulty-file-system.ts imitates.
test(
  'a directory without read permission can be inspected but not listed',
  { skip: !PERMISSIONS_RESTRICT_USER && 'directory permissions do not restrict this user' },
  async (t) => {
    const locked = join(await workspace(t), 'dir');
    await chmod(locked, 0o000);

    try {
      assert.equal(await files.kindOf(locked), 'directory');
      assert.equal(await failureOf(() => files.list(locked)), 'unreadable');
    } finally {
      // Restore before the cleanup hook runs, or the temporary directory cannot be removed.
      await chmod(locked, 0o755);
    }
  },
);

// `2026-10-02-codex-approves-its-own-hook.md` AO15: the person's Codex files are replaced whole, at their real path.
test('replaceText replaces a file whole, keeps its mode, and leaves no temporary file', async (t) => {
  const root = await workspace(t);
  const path = join(root, 'config.toml');
  await writeFile(path, 'model = "a"\n');
  await chmod(path, 0o640);

  await files.replaceText(path, 'model = "b"\n');

  assert.equal(await readFile(path, 'utf8'), 'model = "b"\n');
  assert.equal((await stat(path)).mode & 0o777, 0o640);
  assert.deepEqual((await readdir(root)).filter((name) => name.includes('.agentwhy-')), [], 'no temporary file is left');
});

test('replaceText follows a link to its target, and the link stays a link', async (t) => {
  const root = await workspace(t);
  const dotfiles = join(root, 'dotfiles');
  await mkdir(dotfiles);
  const target = join(dotfiles, 'codex.toml');
  await writeFile(target, 'model = "a"\n');
  const link = join(root, 'config.toml');
  await symlink(target, link);

  await files.replaceText(link, 'model = "b"\n');

  assert.equal((await lstat(link)).isSymbolicLink(), true);
  assert.equal(await readFile(target, 'utf8'), 'model = "b"\n');

  // A link whose target is not there yet: the target is created, and the link kept.
  const dangling = join(root, 'hooks.json');
  await symlink(join(dotfiles, 'hooks.json'), dangling);
  await files.replaceText(dangling, '{}\n');
  assert.equal((await lstat(dangling)).isSymbolicLink(), true);
  assert.equal(await readFile(join(dotfiles, 'hooks.json'), 'utf8'), '{}\n');
});

test('replaceText creates a new file for the owner alone, and fails as a FileAccessError leaving the target as it was', async (t) => {
  const root = await workspace(t);
  const fresh = join(root, 'hooks.json');
  await files.replaceText(fresh, '{}\n');
  assert.equal((await stat(fresh)).mode & 0o777, 0o600);

  await assert.rejects(files.replaceText(join(root, 'missing', 'config.toml'), 'x'), (error) => error instanceof FileAccessError);

  const locked = join(root, 'locked');
  await mkdir(locked);
  const kept = join(locked, 'config.toml');
  await writeFile(kept, 'model = "a"\n');
  await chmod(locked, 0o500);
  try {
    await assert.rejects(files.replaceText(kept, 'model = "b"\n'), (error) => error instanceof FileAccessError);
    assert.equal(await readFile(kept, 'utf8'), 'model = "a"\n', 'the target is as it was');
  } finally {
    await chmod(locked, 0o755);
  }
});
