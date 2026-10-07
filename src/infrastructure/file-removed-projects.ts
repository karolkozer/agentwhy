// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { RemovedProjects } from '../ports/removed-projects.ts';

/**
 * A project as the record names it: the name its sessions' directory has, which holds letters, digits and hyphens
 * only. Nothing that could be a path, and nothing else a hand-edited line could slip in - the shape the record of
 * finished onboardings beside it already uses.
 */
const PROJECT = /^[A-Za-z0-9-]{1,1024}$/;

/**
 * The projects a person took off their list (`.ai/specs/2026-10-06-remove-a-project-from-the-list.md` RM6), as JSON
 * lines in their home directory beside the record of finished onboardings: outside every repository, readable by that
 * person only, appended to and never rewritten. One file for every project, so one read answers the whole list.
 */
export class FileRemovedProjects implements RemovedProjects {
  readonly #file: string;

  constructor(file: string) {
    this.#file = file;
  }

  async removedFrom(projects: readonly string[]): Promise<ReadonlySet<string> | undefined> {
    const removed = await this.#record();
    if (removed === 'failed') return undefined;
    return new Set(projects.filter((project) => removed.has(project)));
  }

  async remove(project: string, at: number): Promise<boolean> {
    return this.#append('removed', project, at);
  }

  /**
   * The record as it stands: every project whose last word is `removed`. Absent is "nothing was ever removed", which is
   * the ordinary answer; any other error is `failed`, and then nothing is hidden at all (RM13).
   */
  async #record(): Promise<ReadonlySet<string> | 'failed'> {
    let text: string;
    try {
      text = await readFile(this.#file, 'utf8');
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
      return missing ? new Set() : 'failed';
    }
    const removed = new Set<string>();
    // In the order written, so the last word for a project counts: nothing agentwhy writes says `kept`, and a person
    // who edits this file by hand can put a project back on their list with one (RM11).
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      try {
        const parsed: unknown = JSON.parse(line);
        // Read from a file a person could have edited: a line that does not hold is skipped.
        if (parsed === null || typeof parsed !== 'object') continue;
        const record = parsed as Record<string, unknown>;
        if (typeof record.project !== 'string' || !PROJECT.test(record.project)) continue;
        if (record.kind === 'removed') removed.add(record.project);
        else if (record.kind === 'kept') removed.delete(record.project);
      } catch {
        // skipped, as a line that does not hold
      }
    }
    return removed;
  }

  async #append(kind: 'removed', project: string, at: number): Promise<boolean> {
    if (!PROJECT.test(project)) return false;
    try {
      await mkdir(dirname(this.#file), { recursive: true, mode: 0o700 });
      await appendFile(this.#file, JSON.stringify({ kind, project, at }) + '\n', { encoding: 'utf8', mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  }
}
