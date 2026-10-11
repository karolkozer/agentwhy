// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join, relative } from 'node:path';
import { ContentFingerprints } from '../../core/access/content-fingerprints.ts';
import { protectionOf, type Policy } from '../../core/policy/policy.ts';
import type { ProjectRoot } from '../../core/project-root.ts';
import type { DirectoryReader } from '../../ports/directory-reader.ts';
import { FileAccessError } from '../../ports/file-access-error.ts';
import type { FileReader } from '../../ports/file-reader.ts';

/** CT7: past this many files a project is too large to walk on every run, and no file is known by its text. */
const MOST_FILES = 20_000;

/** CT2: a file longer than this is read no further, and known by no text. */
const MOST_BYTES = 512 * 1024;

/** CT7: past this much text in all, a walk would hold up every hook of a large project, and no file is known by its text. */
const MOST_TEXT = 32 * 1024 * 1024;

/** CT3: folders a program writes for itself, never a person's private file, and read by no one for this. */
const NOT_WALKED = new Set(['node_modules', '.git', 'dist', 'build', '.venv', 'venv', '__pycache__', '.next', 'coverage', 'target', '.turbo', '.cache']);

/** Where a reading asks for the private files of a session's project, known by their text (CT1). */
export interface FingerprintSource {
  of(projectRoot: ProjectRoot, policy: Policy): Promise<ContentFingerprints | undefined>;
}

export interface ProjectFingerprintsDependencies {
  readonly directories: DirectoryReader;
  readonly files: FileReader;
  /** This run's salt: a hash of a line means nothing outside the run (CT6). */
  readonly salt: string;
}

/**
 * `2026-10-11-the-file-by-its-text.md` CT2, CT7: the project's private files known by their text, walked once a run for
 * each root and policy - `start` reads every conversation of one project, and asks once.
 */
export class ProjectFingerprints implements FingerprintSource {
  readonly #dependencies: ProjectFingerprintsDependencies;
  readonly #known = new Map<string, Promise<ContentFingerprints | undefined>>();

  constructor(dependencies: ProjectFingerprintsDependencies) {
    this.#dependencies = dependencies;
  }

  /** The private files of the project the session ran in, by their text; none where its root is not known. */
  of(projectRoot: ProjectRoot, policy: Policy): Promise<ContentFingerprints | undefined> {
    if (projectRoot.kind !== 'known') return Promise.resolve(undefined);
    const key = JSON.stringify([projectRoot.path, policy.protected]);
    const known = this.#known.get(key) ?? this.#walk(projectRoot.path, policy);
    this.#known.set(key, known);
    return known;
  }

  async #walk(root: string, policy: Policy): Promise<ContentFingerprints | undefined> {
    const paths = await this.#filesUnder(root);
    if (paths === undefined) return undefined;
    // A private file is one a rule of the policy holds, read from the root as a rule is written, or whole.
    const isPrivate = (path: string) => protectionOf(policy, relative(root, path)) !== undefined || protectionOf(policy, path) !== undefined;
    if (!paths.some(isPrivate)) return undefined;
    const collector = ContentFingerprints.collect(this.#dependencies.salt);
    let text = 0;
    for (const path of paths) {
      const lines = await this.#linesOf(path);
      if (lines === undefined) continue;
      text += lines.reduce((sum, line) => sum + line.length + 1, 0);
      if (text > MOST_TEXT) return undefined;
      collector.add({ path, lines, private: isPrivate(path) });
    }
    return collector.done();
  }

  /** Every file under the root but the folders no one reads for this; `undefined` past the most a run walks. */
  async #filesUnder(root: string): Promise<string[] | undefined> {
    const found: string[] = [];
    const folders = [root];
    while (folders.length > 0) {
      const folder = folders.pop() as string;
      let entries;
      try {
        entries = await this.#dependencies.directories.list(folder);
      } catch (error) {
        if (error instanceof FileAccessError) continue;
        throw error;
      }
      for (const entry of entries) {
        if (entry.kind === 'directory' && !NOT_WALKED.has(entry.name)) folders.push(join(folder, entry.name));
        if (entry.kind === 'file') found.push(join(folder, entry.name));
        if (found.length > MOST_FILES) return undefined;
      }
    }
    return found;
  }

  /** A file's lines, read no further than CT2 lets; `undefined` for one too long, holding a NUL, or not readable. */
  async #linesOf(path: string): Promise<string[] | undefined> {
    const lines: string[] = [];
    let bytes = 0;
    try {
      for await (const line of this.#dependencies.files.readLines(path)) {
        bytes += line.length + 1;
        if (bytes > MOST_BYTES || line.includes('\u0000')) return undefined;
        lines.push(line);
      }
    } catch (error) {
      if (error instanceof FileAccessError) return undefined;
      throw error;
    }
    return lines;
  }
}
