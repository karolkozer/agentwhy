// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, lstat, mkdir, open, readdir, readFile, readlink, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { DirectoryEntry, DirectoryReader, EntryKind } from '../ports/directory-reader.ts';
import { FileAccessError } from '../ports/file-access-error.ts';
import type { FileReader } from '../ports/file-reader.ts';
import type { FileReplacer } from '../ports/file-replacer.ts';
import type { FileTailReader } from '../ports/file-tail-reader.ts';
import type { FileWriter } from '../ports/file-writer.ts';

/**
 * The owner alone, for everything this writes. What it writes is a report: which protected files an agent
 * reached, the titles a person gave their sessions, the paths of the project they were in. `report --open` and
 * `start` both land that in the system's temporary directory, which on Linux is one `/tmp` shared by every
 * account on the machine - and the default of `writeFile` there is a file the whole machine can read.
 *
 * `FileMarkStore` has held its record at `0o600` under a `0o700` directory since it was written; this is the
 * same standard, applied to the larger of the two things this tool puts on disk.
 */
const OWNER_ONLY_FILE = 0o600;
const OWNER_ONLY_DIRECTORY = 0o700;

export class NodeFileSystem implements DirectoryReader, FileReader, FileReplacer, FileTailReader, FileWriter {
  async writeText(path: string, text: string): Promise<void> {
    await attempt(path, () => writeFile(path, text, { mode: OWNER_ONLY_FILE }));
  }

  /**
   * AO15: the text goes to a temporary file beside the real target - a link followed, so a dotfiles link stays a link -
   * with the target's mode, and then takes its place in one rename. A failure removes the temporary file and leaves the
   * target as it was.
   */
  async replaceText(path: string, text: string): Promise<void> {
    const target = await attempt(path, () => realTarget(path));
    const mode = await stat(target).then((found) => found.mode & 0o777, () => OWNER_ONLY_FILE);
    const temporary = join(dirname(target), `.${basename(target)}.agentwhy-${randomBytes(6).toString('hex')}.tmp`);
    try {
      await attempt(path, () => writeFile(temporary, text, { mode, flag: 'wx' }));
      // The mode a file is created with is cut by the process's umask; the target's own is set again before the rename.
      await attempt(path, () => chmod(temporary, mode));
      await attempt(path, () => rename(temporary, target));
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async ensureDirectory(path: string): Promise<void> {
    await attempt(path, () => mkdir(path, { recursive: true, mode: OWNER_ONLY_DIRECTORY }));
  }

  async kindOf(path: string): Promise<EntryKind> {
    return entryKind(await attempt(path, () => stat(path)));
  }

  async modifiedAt(path: string): Promise<number> {
    return (await attempt(path, () => stat(path))).mtimeMs;
  }

  async list(path: string): Promise<readonly DirectoryEntry[]> {
    const entries = await attempt(path, () => readdir(path, { withFileTypes: true }));
    return entries.map((entry) => ({ name: entry.name, kind: entryKind(entry) }));
  }

  readText(path: string): Promise<string> {
    return attempt(path, () => readFile(path, 'utf8'));
  }

  /** Read by position, so a transcript of any size costs at most `bytes`. A read may return less than asked, hence the loop. */
  readTail(path: string, bytes: number): Promise<string> {
    return attempt(path, async () => {
      const handle = await open(path, 'r');
      try {
        const { size } = await handle.stat();
        const length = Math.min(bytes, size);
        const buffer = Buffer.alloc(length);
        let filled = 0;
        while (filled < length) {
          const { bytesRead } = await handle.read(buffer, filled, length - filled, size - length + filled);
          if (bytesRead === 0) break;
          filled += bytesRead;
        }
        return buffer.subarray(0, filled).toString('utf8');
      } finally {
        await handle.close();
      }
    });
  }

  /**
   * JSONL records are delimited by \n alone. `readline` also ends a line on a lone \r, which JSON counts as
   * ordinary whitespace between tokens - so a record containing one would be split into two halves, each
   * unparsable, and the record itself lost. Measured on one session, where it cost one `user` line.
   */
  async *readLines(path: string): AsyncIterable<string> {
    const stream = createReadStream(path, { encoding: 'utf8' });
    let pending = '';

    try {
      for await (const chunk of stream) {
        const parts = (pending + chunk).split('\n');
        pending = parts.pop() ?? '';
        for (const line of parts) yield withoutTrailingReturn(line);
      }
    } catch (error) {
      throw accessError(path, error);
    }
    if (pending !== '') yield withoutTrailingReturn(pending);
  }
}

/** Only a \r that terminates the line is a terminator: that is a CRLF file, not a record with a \r inside it. */
function withoutTrailingReturn(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function entryKind(entry: { isFile(): boolean; isDirectory(): boolean }): EntryKind {
  if (entry.isFile()) return 'file';
  if (entry.isDirectory()) return 'directory';
  return 'other';
}

/**
 * The file a path names, every link followed; a file not there yet is named by its folder's real path. A link whose
 * target is not there yet is followed to that target, so the write creates it and the link stays a link.
 */
async function realTarget(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    const linked = await lstat(path).then((found) => found.isSymbolicLink(), () => false);
    if (linked) return realTarget(resolve(dirname(path), await readlink(path)));
    return join(await realpath(dirname(path)), basename(path));
  }
}

async function attempt<T>(path: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw accessError(path, error);
  }
}

// Only the failures the application turns into a status are translated; anything else propagates unchanged.
function accessError(path: string, error: unknown): unknown {
  const code = error instanceof Error && 'code' in error ? error.code : undefined;
  // A name too long for the system, or a loop of links, names nothing that can be opened: found by measuring `refuse`
  // on real transcripts, where a script passed on a command line was looked up as a directory.
  if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'ENAMETOOLONG' || code === 'ELOOP') {
    return new FileAccessError('not-found', path, { cause: error });
  }
  // A folder read as a file cannot be read as one: `report --input` given a folder of Codex rollouts, which `doctor` takes.
  if (code === 'EACCES' || code === 'EPERM' || code === 'EISDIR') return new FileAccessError('unreadable', path, { cause: error });
  return error;
}
