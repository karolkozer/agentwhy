import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { OnboardingReading, OnboardingStore } from '../ports/onboarding-store.ts';

/**
 * A project as the record names it: the name its sessions' directory has, which holds letters, digits and hyphens
 * only. Nothing that could be a path, and nothing else a hand-edited line could slip in.
 */
const PROJECT = /^[A-Za-z0-9-]{1,1024}$/;

/**
 * Which projects' onboarding a person finished, as JSON lines in their home directory beside their notice preferences
 * (`.ai/specs/2026-09-24-onboarding.md` W21): outside every repository, readable by that person only, appended to.
 * One file for every project, so "has this person seen the intro anywhere?" is one read (N1, N2).
 */
export class FileOnboardingStore implements OnboardingStore {
  readonly #file: string;
  readonly #project: string;

  constructor(file: string, project: string) {
    this.#file = file;
    this.#project = project;
  }

  async read(): Promise<OnboardingReading> {
    const record = await this.#record();
    if (record === 'failed') return { here: false, anywhere: false, failed: true };
    return { here: record.finished.has(this.#project), anywhere: record.anywhere, failed: false };
  }

  async doneFor(projects: readonly string[]): Promise<ReadonlySet<string> | undefined> {
    const record = await this.#record();
    if (record === 'failed') return undefined;
    return new Set(projects.filter((project) => record.finished.has(project)));
  }

  /**
   * The record as it stands: every project whose last word is `done`, and whether any project ever finished. Absent is
   * "never"; any other error is `failed`.
   */
  async #record(): Promise<{ readonly finished: ReadonlySet<string>; readonly anywhere: boolean } | 'failed'> {
    let text: string;
    try {
      text = await readFile(this.#file, 'utf8');
    } catch (error) {
      // Never finished is the ordinary answer; anything else is a record that exists and was not read.
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
      return missing ? { finished: new Set(), anywhere: false } : 'failed';
    }
    const finished = new Set<string>();
    let anywhere = false;
    // In the order written: a reset for a project cancels the `done` before it (W25a), and a later `done` counts again.
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      try {
        const parsed: unknown = JSON.parse(line);
        // Read from a file a person could have edited: a line that does not hold is skipped.
        if (parsed !== null && typeof parsed === 'object') {
          const record = parsed as Record<string, unknown>;
          if (typeof record.project !== 'string' || !PROJECT.test(record.project)) continue;
          if (record.kind === 'done') {
            // The intro is once per person (N2): a finish anywhere counts, whatever was reset after it.
            anywhere = true;
            finished.add(record.project);
          } else if (record.kind === 'reset') {
            finished.delete(record.project);
          }
        }
      } catch {
        // skipped, as a line that does not hold
      }
    }
    return { finished, anywhere };
  }

  async add(at: number): Promise<boolean> {
    return this.#append('done', at);
  }

  async reset(at: number): Promise<boolean> {
    return this.#append('reset', at);
  }

  async #append(kind: 'done' | 'reset', at: number): Promise<boolean> {
    if (!PROJECT.test(this.#project)) return false;
    try {
      await mkdir(dirname(this.#file), { recursive: true, mode: 0o700 });
      await appendFile(this.#file, JSON.stringify({ kind, project: this.#project, at }) + '\n', { encoding: 'utf8', mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  }
}
