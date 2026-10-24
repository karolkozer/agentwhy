// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StartNoteStore } from '../ports/start-note-store.ts';

/** A project as the record names it, as the onboarding record does: letters, digits and hyphens, nothing like a path. */
const PROJECT = /^[A-Za-z0-9-]{1,1024}$/;

/**
 * When `session-start` told the agent about a project, as JSON lines beside the onboarding record in the person's home
 * directory: outside every repository, readable by that person only, appended to.
 */
export class FileStartNoteStore implements StartNoteStore {
  readonly #file: string;

  constructor(file: string) {
    this.#file = file;
  }

  async lastToldAt(project: string): Promise<number | undefined | 'failed'> {
    let text: string;
    try {
      text = await readFile(this.#file, 'utf8');
    } catch (error) {
      // Never told is the ordinary answer; any other error is a record that exists and was not read.
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
      return missing ? undefined : 'failed';
    }
    let latest: number | undefined;
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      try {
        const parsed: unknown = JSON.parse(line);
        // Read from a file a person could have edited: a line that does not hold is skipped.
        if (parsed === null || typeof parsed !== 'object') continue;
        const record = parsed as Record<string, unknown>;
        if (record.project !== project || typeof record.at !== 'number' || !Number.isFinite(record.at)) continue;
        latest = latest === undefined ? record.at : Math.max(latest, record.at);
      } catch {
        // skipped, as a line that does not hold
      }
    }
    return latest;
  }

  async add(project: string, at: number): Promise<boolean> {
    if (!PROJECT.test(project)) return false;
    try {
      await mkdir(dirname(this.#file), { recursive: true, mode: 0o700 });
      await appendFile(this.#file, JSON.stringify({ project, at }) + '\n', { encoding: 'utf8', mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  }
}
