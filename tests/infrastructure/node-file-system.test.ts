// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.ts';
import { isDirectory } from '../../src/ports/directory-reader.ts';
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

// A stream hands a file over in 64 KiB chunks. A pasted image is one line of megabytes, and a line is cut wherever a
// chunk ends - inside a two-byte letter, or between the \r and the \n of a CRLF.
test('reads a line that spans many chunks whole, and a letter or a CRLF cut between two chunks', async (t) => {
  const root = await workspace(t);
  const chunk = 64 * 1024;
  const cutLetter = 'x'.repeat(chunk - 1) + 'ż';
  const beforeCut = 'a'.repeat(2 * chunk - 1 - (Buffer.byteLength(cutLetter) + 2));
  const long = 'zażółć gęślą jaźń '.repeat(20_000);
  const text = `${cutLetter}\n\n${beforeCut}\r\n${long}\n{"end":true}`;
  assert.equal(Buffer.byteLength(`${cutLetter}\n\n${beforeCut}`), 2 * chunk - 1, 'the \\r is the last byte of the second chunk');
  const path = join(root, 'long.jsonl');
  await writeFile(path, text);

  assert.deepEqual(await drain(files.readLines(path)), [cutLetter, '', beforeCut, long, '{"end":true}']);
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

// Found 2026-10-24: `start` failed for a whole project, "EBADF: bad file descriptor, lstat '/DEV/fd/11'". A command's
// `<(…)` leaves `/dev/fd/<n>` in a transcript; looked at by a process that does not hold that descriptor, macOS says
// EBADF and Linux ENOENT. Either way it names nothing that can be opened.
test('a descriptor this process does not hold is not found, so a look at it fails no page', { skip: process.platform === 'win32' }, async () => {
  const files = new NodeFileSystem();
  for (const path of ['/dev/fd/250', '/DEV/fd/250']) {
    await assert.rejects(files.kindOf(path), (error: unknown) => error instanceof FileAccessError && error.failure === 'not-found', path);
    assert.equal(await isDirectory(files, path), false, path);
  }
});

// Seen 2026-11-25: a served report of 24 MB, read while a refresh wrote it again, was sent cut in half - a page with no script, and so empty.
test('a file written again is whole at every moment: the old text or the new one, and never a part', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agentwhy-whole-'));
  const path = join(directory, 'report.html');
  const page = (letter: string): string => letter.repeat(8_000_000) + '</html>';
  const system = new NodeFileSystem();
  await system.writeText(path, page('a'));
  let writing = true;
  const writes = (async () => { for (const letter of 'bcdefg') await system.writeText(path, page(letter)); writing = false; })();
  const seen = new Set<number>();
  while (writing) seen.add((await system.readText(path)).length);
  await writes;
  assert.deepEqual([...seen], [8_000_007]);
  assert.deepEqual(await readdir(directory), ['report.html'], 'nothing is left beside it');
  assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test('a file that is a link is written through it, and one in a folder that takes no new file is written where it is', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agentwhy-whole-'));
  const system = new NodeFileSystem();
  await writeFile(join(directory, 'real.txt'), 'one');
  await symlink(join(directory, 'real.txt'), join(directory, 'link.txt'));
  await system.writeText(join(directory, 'link.txt'), 'two');
  assert.equal(await readFile(join(directory, 'real.txt'), 'utf8'), 'two');
  assert.ok((await lstat(join(directory, 'link.txt'))).isSymbolicLink());
  await chmod(directory, 0o500);
  try {
    await system.writeText(join(directory, 'real.txt'), 'three');
    assert.equal(await readFile(join(directory, 'real.txt'), 'utf8'), 'three');
  } finally {
    await chmod(directory, 0o700);
  }
});

// The review of 2026-11-25: a rename replaces what its owner made read-only, which a write in place refuses.
test('a read-only file is never written over', { skip: !PERMISSIONS_RESTRICT_USER && 'file permissions do not restrict this user' }, async (t) => {
  const path = join(await workspace(t), 'dir', 'a.txt');
  await chmod(path, 0o444);
  assert.equal(await failureOf(() => files.writeText(path, 'new')), 'unreadable');
  assert.equal(await readFile(path, 'utf8'), 'first\nsecond\r\nthird');
  assert.deepEqual(await readdir(join(path, '..')), ['a.txt']);
});

// The second review of 2026-11-25: a full disk left the old file whole, and the write in its place then cut it.
test('a write that failed for want of room never falls back to cutting the file in place', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'agentwhy-full-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const path = join(folder, 'settings.json');
  await writeFile(path, 'the old text');
  class Full extends NodeFileSystem {
    override async replaceText(): Promise<void> { throw Object.assign(new Error('no space left'), { code: 'ENOSPC' }); }
  }
  await assert.rejects(new Full().writeText(path, 'the new text'), /no space left/);
  assert.equal(await readFile(path, 'utf8'), 'the old text');
});
