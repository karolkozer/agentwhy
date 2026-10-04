// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CheckedReading, CheckedStore } from '../ports/checked-store.ts';

/** A session id as Claude Code names a transcript: nothing that could be a path or carry anything else. */
const SESSION_ID = /^[A-Za-z0-9_-]{1,200}$/;

/**
 * The conversations a person asked to be checked, as JSON lines in their home directory beside their marks
 * (`for-people-who-build-with-ai.md` F55): outside every repository, readable by that person only, appended to.
 */
export class FileCheckedStore implements CheckedStore {
  readonly #file: string;

  constructor(file: string) {
    this.#file = file;
  }

  async read(): Promise<CheckedReading> {
    let text: string;
    try {
      text = await readFile(this.#file, 'utf8');
    } catch (error) {
      // Never asked is the ordinary answer; anything else is a record that exists and was not read.
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
      return { ids: new Set(), failed: !missing };
    }
    const ids = new Set<string>();
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      try {
        const parsed: unknown = JSON.parse(line);
        // Read from a file a person could have edited: a line that does not hold is skipped.
        if (parsed !== null && typeof parsed === 'object') {
          const record = parsed as Record<string, unknown>;
          if (record.kind === 'checked' && typeof record.id === 'string' && SESSION_ID.test(record.id)) ids.add(record.id);
        }
      } catch {
        // skipped, as a line that does not hold
      }
    }
    return { ids, failed: false };
  }

  async add(id: string, at: number): Promise<boolean> {
    if (!SESSION_ID.test(id)) return false;
    try {
      await mkdir(dirname(this.#file), { recursive: true, mode: 0o700 });
      await appendFile(this.#file, JSON.stringify({ kind: 'checked', id, at }) + '\n', { encoding: 'utf8', mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  }
}
