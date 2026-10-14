// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { basename, dirname, isAbsolute, normalize } from 'node:path';
import type { DirectoryReader, EntryKind } from '../ports/directory-reader.ts';
import { FileAccessError } from '../ports/file-access-error.ts';

/** A folder's entries by their loose name (`loose`), each with every kind listed under it. */
type Listing = ReadonlyMap<string, readonly EntryKind[]>;

/**
 * `2026-10-14-a-place-that-is-no-folder.md` WF2-WF4: whether a folder may hold an entry, answered from listings - its
 * parent's, then its own - each folder listed once for as long as this is kept: one listing of conversations. "No" only
 * where opening a file inside it could not have found one; whatever a listing cannot say is "may" (WF3).
 */
export class FolderListings {
  readonly #directories: DirectoryReader;
  readonly #listed = new Map<string, Promise<Listing | undefined>>();

  constructor(directories: DirectoryReader) {
    this.#directories = directories;
  }

  readonly mayHold = async (folder: string, entry: string): Promise<boolean> => {
    // A `.`, a `..`, a doubled slash: not the folder's shortest name, which its parent's listing could not answer for.
    if (!isAbsolute(folder) || normalize(folder) !== folder || /[\\/]$/.test(folder)) return true;
    const parent = dirname(folder);
    if (parent === folder) return true;
    const above = await this.#listing(parent);
    if (above === undefined) return true;
    const kinds = above.get(loose(basename(folder)));
    // Its folder lists nothing of its name, or only a plain file: nothing can be opened inside it.
    if (kinds === undefined || kinds.every((kind) => kind === 'file')) return false;
    // A folder, or a link, which is listed as neither: its own listing says, as a read through it would.
    const own = await this.#listing(folder);
    return own === undefined || own.has(loose(entry));
  };

  #listing(folder: string): Promise<Listing | undefined> {
    let listed = this.#listed.get(folder);
    if (listed === undefined) {
      listed = this.#directories.list(folder).then(
        (entries) => {
          const byName = new Map<string, EntryKind[]>();
          for (const one of entries) byName.set(loose(one.name), [...(byName.get(loose(one.name)) ?? []), one.kind]);
          return byName;
        },
        (error: unknown) => {
          if (error instanceof FileAccessError) return undefined;
          throw error;
        },
      );
      this.#listed.set(folder, listed);
    }
    return listed;
  }
}

/** A name as a disk that does not tell `Shop` from `shop`, or one Unicode form from another, would find it (macOS). */
function loose(name: string): string {
  return name.normalize('NFC').toLowerCase();
}
