import type { DirectoryEntry, DirectoryReader, EntryKind } from '../../src/ports/directory-reader.ts';
import { FileAccessError } from '../../src/ports/file-access-error.ts';
import type { FileReader } from '../../src/ports/file-reader.ts';

/**
 * Decorator that makes chosen paths unreadable the way a path without read permission behaves: it can still be
 * inspected, but listing or reading it fails. Everything else is delegated to the wrapped implementation.
 */
export class FaultyFileSystem implements DirectoryReader, FileReader {
  readonly #inner: DirectoryReader & FileReader;
  readonly #unreadable: ReadonlySet<string>;

  constructor(inner: DirectoryReader & FileReader, unreadable: Iterable<string>) {
    this.#inner = inner;
    this.#unreadable = new Set(unreadable);
  }

  kindOf(path: string): Promise<EntryKind> {
    return this.#inner.kindOf(path);
  }

  async modifiedAt(path: string): Promise<number> {
    this.#refuse(path);
    return this.#inner.modifiedAt(path);
  }

  async list(path: string): Promise<readonly DirectoryEntry[]> {
    this.#refuse(path);
    return this.#inner.list(path);
  }

  async readText(path: string): Promise<string> {
    this.#refuse(path);
    return this.#inner.readText(path);
  }

  async *readLines(path: string): AsyncIterable<string> {
    this.#refuse(path);
    yield* this.#inner.readLines(path);
  }

  #refuse(path: string): void {
    if (this.#unreadable.has(path)) throw new FileAccessError('unreadable', path);
  }
}
