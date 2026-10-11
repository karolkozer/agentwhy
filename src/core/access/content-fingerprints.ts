// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

/** One text file of a project, read for its lines alone: its whole path, and whether a rule makes it private. */
export interface ProjectText {
  readonly path: string;
  readonly lines: Iterable<string>;
  readonly private: boolean;
}

/** CT3: a line long enough, and worded enough, to be a file's own rather than any file's. */
const SHORTEST_LINE = 20;
const WORDED = /\p{L}{3}/u;

/**
 * `2026-10-11-the-file-by-its-text.md` CT1-CT6: the project's private files, known by their text. Each holds the lines
 * no other text file of the project holds (CT3), only as hashes salted for this run (CT6): what reaches a report is which
 * file a call's output showed, never a line. Found 2026-10-11 by the maintainer's rounds: a private file's text printed by
 * a line the command reader did not know said *Only saw a name* (CTB1), and the file's own lines were in the output.
 */
export class ContentFingerprints {
  readonly #salt: string;
  /** A distinctive line's hash, and the private file whose it is. */
  readonly #owners: ReadonlyMap<string, string>;
  /** How many distinctive lines each private file has. */
  readonly #distinct: ReadonlyMap<string, number>;

  private constructor(salt: string, owners: ReadonlyMap<string, string>, distinct: ReadonlyMap<string, number>) {
    this.#salt = salt;
    this.#owners = owners;
    this.#distinct = distinct;
  }

  /** From every text file of a project: a line one file holds alone is that file's, kept where the file is private. */
  static of(texts: Iterable<ProjectText>, salt: string): ContentFingerprints {
    const collector = ContentFingerprints.collect(salt);
    for (const text of texts) collector.add(text);
    return collector.done();
  }

  /**
   * One file at a time, its lines hashed as they come and dropped (CT6): a walk of a project holds no file's text past
   * the file it is reading.
   */
  static collect(salt: string): { add(text: ProjectText): void; done(): ContentFingerprints } {
    const holders = new Map<string, string | null>();
    const privates = new Set<string>();
    const hash = hashing(salt);
    return {
      add(text) {
        if (text.private) privates.add(text.path);
        const own = new Set<string>();
        for (const raw of text.lines) {
          const line = raw.trim();
          if (line.length >= SHORTEST_LINE && WORDED.test(line)) own.add(hash(line));
        }
        for (const key of own) holders.set(key, holders.has(key) ? null : text.path);
      },
      done() {
        const owners = new Map<string, string>();
        const distinct = new Map<string, number>();
        for (const [key, holder] of holders) {
          if (holder === null || !privates.has(holder)) continue;
          owners.set(key, holder);
          distinct.set(holder, (distinct.get(holder) ?? 0) + 1);
        }
        return new ContentFingerprints(salt, owners, distinct);
      },
    };
  }

  /** How many private files can be known by their text. */
  get files(): number {
    return this.#distinct.size;
  }

  /**
   * CT1, CT4: the private files whose text one call's output holds - two of its distinctive lines or more, or the one it
   * has where it has only one - its lines read as the AI was shown them, numbers stripped.
   */
  filesShown(outputs: readonly string[]): readonly string[] {
    const hash = hashing(this.#salt);
    const found = new Map<string, Set<string>>();
    for (const output of outputs) {
      for (const raw of output.split('\n')) {
        const key = hash(shownLine(raw));
        const owner = this.#owners.get(key);
        if (owner === undefined) continue;
        const keys = found.get(owner) ?? new Set<string>();
        keys.add(key);
        found.set(owner, keys);
      }
    }
    return [...found].filter(([owner, keys]) => keys.size >= Math.min(2, this.#distinct.get(owner) ?? 0)).map(([owner]) => owner).sort();
  }
}

function hashing(salt: string): (line: string) => string {
  return (line) => createHash('sha256').update(`${salt}:text:${line}`).digest('hex');
}

/**
 * CT4: a line of output as the file holds it - without the number Claude Code's Read puts before it (`  12→`), the one
 * `cat -n` and `nl` put (`    12\t`), or a search's place (`path:12:`, `12:`, `path-12-`).
 */
export function shownLine(raw: string): string {
  return raw.replace(/\r$/, '').replace(/^\s*\d+(?:→|\t)/, '').replace(/^[^\s:]+[:-]\d+[:-]/, '').replace(/^\d+[:-]/, '').trim();
}
