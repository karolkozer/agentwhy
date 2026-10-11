// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join, posix } from 'node:path';
import type { ProjectRoot } from '../core/project-root.ts';
import type { DirectoryReader } from '../ports/directory-reader.ts';
import { FileAccessError } from '../ports/file-access-error.ts';
import type { WrittenName } from './build-report.ts';

/** Past this many files and folders, a project's index is not built, and every relative name stays (NX4). */
const MOST_ENTRIES = 50_000;

/**
 * Folders whose names no one asks after one by one, and which would spend the index's whole allowance. A build's output
 * is indexed: an agent names `dist/…` and `build/…` files it just made (NXB3).
 */
const NOT_INDEXED = new Set(['.git', 'node_modules']);

/** Which names a call only wrote are on no disk (`2026-10-11-a-name-that-is-no-file.md` NX2). */
export interface NameLookup {
  absent(names: readonly WrittenName[], projectRoot: ProjectRoot): Promise<ReadonlySet<string>>;
}

/**
 * `2026-10-11-a-name-that-is-no-file.md` NX2, NX4: the names a call only wrote that are on disk at none of their places -
 * Codex's `for p in /AGENTS.md /Users/someone/AGENTS.md …` asking after files no folder holds (NXB2). A relative name may be one
 * in a folder the line moved to and this could not follow - 153 of the first 1264 names left out were (NXB3) - so it is
 * also looked for anywhere in the project, by an index of its paths built once a run. Each place is looked at, never
 * opened; only "not found" is absence, and a place that cannot be looked at, or an index too large to build, keeps it.
 */
export class NamesOnDisk implements NameLookup {
  readonly #directories: DirectoryReader;
  readonly #indexes = new Map<string, Promise<ReadonlyMap<string, readonly string[]> | undefined>>();

  constructor(dependencies: { readonly directories: DirectoryReader }) {
    this.#directories = dependencies.directories;
  }

  async absent(names: readonly WrittenName[], projectRoot: ProjectRoot): Promise<ReadonlySet<string>> {
    const looked = new Map<string, Promise<boolean>>();
    const there = (place: string): Promise<boolean> => {
      const known = looked.get(place) ?? this.#directories.kindOf(place).then(
        () => true,
        (error: unknown) => !(error instanceof FileAccessError && error.failure === 'not-found'),
      );
      looked.set(place, known);
      return known;
    };
    const absent = new Set<string>();
    await Promise.all(names.map(async ({ key, places, relative }) => {
      if (places.length === 0 || (await Promise.all(places.map(there))).some(Boolean)) return;
      if (relative !== undefined) {
        const index = projectRoot.kind === 'known' ? await this.#indexOf(projectRoot.path) : undefined;
        if (index === undefined || (index.get(posix.basename(relative)) ?? []).some((path) => path === relative || path.endsWith(`/${relative}`))) return;
      }
      absent.add(key);
    }));
    return absent;
  }

  /** Every path of the project but the folders a program writes for itself, by its last part; `undefined` past the most. */
  #indexOf(root: string): Promise<ReadonlyMap<string, readonly string[]> | undefined> {
    const known = this.#indexes.get(root) ?? this.#walk(root);
    this.#indexes.set(root, known);
    return known;
  }

  async #walk(root: string): Promise<ReadonlyMap<string, readonly string[]> | undefined> {
    const byName = new Map<string, string[]>();
    const folders = [''];
    let entries = 0;
    while (folders.length > 0) {
      const folder = folders.pop() as string;
      let listed;
      try {
        listed = await this.#directories.list(folder === '' ? root : join(root, folder));
      } catch (error) {
        if (!(error instanceof FileAccessError)) throw error;
        // A project no longer there - a worktree removed since - is not one that holds nothing: its names stay.
        if (folder === '') return undefined;
        continue;
      }
      for (const entry of listed) {
        entries += 1;
        if (entries > MOST_ENTRIES) return undefined;
        const path = folder === '' ? entry.name : `${folder}/${entry.name}`;
        const same = byName.get(entry.name);
        if (same === undefined) byName.set(entry.name, [path]);
        else same.push(path);
        if (entry.kind === 'directory' && !NOT_INDEXED.has(entry.name)) folders.push(path);
      }
    }
    return byName;
  }
}
