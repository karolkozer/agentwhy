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
