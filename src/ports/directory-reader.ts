// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { FileAccessError } from './file-access-error.ts';

export type EntryKind = 'file' | 'directory' | 'other';

export interface DirectoryEntry {
  readonly name: string;
  readonly kind: EntryKind;
}

/** What exists in the directory tree. Discovery needs this and nothing more. */
export interface DirectoryReader {
  /** Throws FileAccessError when the path does not exist or cannot be inspected. */
  kindOf(path: string): Promise<EntryKind>;
  /** Throws FileAccessError when the directory does not exist or cannot be listed. */
  list(path: string): Promise<readonly DirectoryEntry[]>;
  /**
   * When the entry last changed, in milliseconds since the epoch. Used to put a list of sessions in order and
   * for nothing else: correlation never goes by time (architecture invariant 3).
   */
  modifiedAt(path: string): Promise<number>;
}

/** Whether a folder is there: an error the port names is "no", and nothing else is swallowed. */
export async function isDirectory(directories: DirectoryReader, path: string): Promise<boolean> {
  try {
    return (await directories.kindOf(path)) === 'directory';
  } catch (error) {
    if (!(error instanceof FileAccessError)) throw error;
    return false;
  }
}
