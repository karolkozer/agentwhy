// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AlertStore, RememberedAlert } from '../ports/alert-store.ts';

/** One directory of its own, so pruning never looks at a file this tool did not write. */
const DIRECTORY = 'agentwhy-alerts';

/** A session nobody finished leaves a file behind. After this it is swept, whether its turn ever ended or not. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Everything else in a session id is replaced, so no id can name a path of its own. */
const UNSAFE = /[^A-Za-z0-9._-]/g;

/** Between the session and the record in a file's name: no id can hold it, so no session is read as part of another. */
const OF = '@';

/** One record. Anything else in the directory is not read as one. */
const RECORD = '.json';

/** A record being written, or one a run has claimed and is reading: never read as a record by another run. */
const IN_HAND = '.part';

/**
 * The alerts of a session, in the system's temporary directory (`specs/2026-09-16-a-notice-in-the-conversation.md`
 * R7): written when `SubagentStop` finds one, read and cleared when `Stop` says it, and swept by age so an
 * abandoned session leaves nothing behind.
 *
 * A file of its own for each record. Claude Code runs hooks side by side - two helpers that finish together, a helper
 * that finishes while the turn's `Stop` is still reading - and one file for a session was read, changed and written
 * whole by each: the later write put back what the earlier one had replaced, and of two findings kept at the same moment
 * one was never said (`when-an-agent-finishes` B4j). Here no run writes over another's record, a record appears whole
 * or not at all, and of two runs that take one, one gets it - with no lock, which a hook that was ended would leave held.
 *
 * Nothing here throws. A hook cannot afford it: on `SubagentStop` an error becomes the agent's next instruction, and
 * on `Stop` it holds the turn open. A store that could not write is a notice that was not said - and `check` still
 * finds the same thing in the records.
 */
export class FileAlertStore implements AlertStore {
  readonly #directory: string;
  readonly #user: number | undefined;
  readonly #now: () => number;

  constructor(temporaryDirectory: string, user?: number, now: () => number = Date.now) {
    this.#directory = join(temporaryDirectory, DIRECTORY);
    this.#user = user;
    this.#now = now;
  }

  /**
   * Whether the directory this run would use is this person's own. A mode on `mkdir` settles how a directory is
   * created and says nothing about one that was there already - and on Linux the system's temporary directory is
   * one `/tmp` shared by every account, where this directory's fixed name is a name another account can take
   * first. A symlink left under it would send every write below into whatever directory its author chose.
   *
   * So: not a link, this person's own, and not writable by anyone else. Anything short of that and there is no
   * store, which is a state this class already has an answer for - see the note above.
   *
   * Windows has neither to ask: no owner id (Node has no user id there, so the shell gives none) and no mode bits - every
   * directory reads as `0o666`. Asked as on POSIX, the store never held a thing there, and what `SubagentStop` found was
   * never said (`2026-10-12-windows-paths.md` WPB6). Its temporary directory is under the person's own profile, and who
   * else may write in it is its access list's to say; a link is still refused.
   */
  async #mine(): Promise<boolean> {
    try {
      const entry = await lstat(this.#directory);
      if (!entry.isDirectory()) return false;
      if (this.#user === undefined) return true;
      return entry.uid === this.#user && (entry.mode & 0o022) === 0;
    } catch {
      return false;
    }
  }

  async remember(sessionId: string, alert: RememberedAlert): Promise<void> {
    try {
      if (!(await this.#ready())) return;
      const file = this.#fileFor(sessionId, alert.agentId);
      const draft = inHand(file);
      await writeFile(draft, JSON.stringify(alert), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      try {
        await rename(draft, file);
      } catch (error) {
        await rm(draft, { force: true });
        throw error;
      }
    } catch {
      // See the note above: a store that could not write says nothing, and nothing is a state this tool has words for.
    }
  }

  async rememberOnce(sessionId: string, alert: RememberedAlert): Promise<boolean> {
    try {
      if (!(await this.#ready())) return true;
      // The file itself is the answer: whoever made it is the one that says it.
      await writeFile(this.#fileFor(sessionId, alert.agentId), JSON.stringify(alert), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      return true;
    } catch (error) {
      return codeOf(error) !== 'EEXIST';
    }
  }

  async take(sessionId: string, leaving: readonly string[] = []): Promise<readonly RememberedAlert[]> {
    const left = new Set(leaving.map((agentId) => this.#fileFor(sessionId, agentId)));
    const files = await this.#filesOf(sessionId);
    return present(await Promise.all(files.map((file) => (left.has(file) ? this.#readAndRenew(file) : this.#claim(file)))));
  }

  async forget(sessionId: string, agentId: string): Promise<void> {
    if (!(await this.#mine())) return;
    // What could not be forgotten stays said.
    await rm(this.#fileFor(sessionId, agentId), { force: true }).catch(() => undefined);
  }

  async peek(sessionId: string): Promise<readonly RememberedAlert[]> {
    return present(await Promise.all((await this.#filesOf(sessionId)).map(readRecord)));
  }

  /** The directory, there and this person's own, and swept. */
  async #ready(): Promise<boolean> {
    // The owner alone, and the directory first: the system's temporary directory is one `/tmp` shared by every
    // account on a Linux machine, and this directory's name is fixed, so it is a name another account can reach
    // for. A mode of its own keeps what is written here - which protected file an agent reached, and in whose
    // session - out of every other account's reading.
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    if (!(await this.#mine())) return false;
    await this.#prune();
    return true;
  }

  /** One run's alone from here on: a record moved out of the way is found by no other. */
  async #claim(file: string): Promise<RememberedAlert | undefined> {
    const mine = inHand(file);
    try {
      await rename(file, mine);
    } catch (error) {
      // Gone is another run's. Said once is said: if the file survives, the next turn repeats a notice. That is better
      // than losing one.
      return codeOf(error) === 'ENOENT' ? undefined : readRecord(file);
    }
    const read = await readRecord(mine);
    await rm(mine, { force: true }).catch(() => undefined);
    return read;
  }

  /** What is left in place is of a conversation still going: its age begins again, so the sweep leaves it. */
  async #readAndRenew(file: string): Promise<RememberedAlert | undefined> {
    const read = await readRecord(file);
    const now = new Date(this.#now());
    await utimes(file, now, now).catch(() => undefined);
    return read;
  }

  /** The records of one session, by their names alone, and in their order: the words said of several count them. */
  async #filesOf(sessionId: string): Promise<readonly string[]> {
    if (!(await this.#mine())) return [];
    const session = `${safe(sessionId, 'session')}${OF}`;
    try {
      return (await readdir(this.#directory))
        .filter((name) => name.startsWith(session) && name.endsWith(RECORD))
        .sort()
        .map((name) => join(this.#directory, name));
    } catch {
      // No directory is the common case, and nothing kept.
      return [];
    }
  }

  #fileFor(sessionId: string, agentId: string): string {
    return join(this.#directory, `${safe(sessionId, 'session')}${OF}${safe(agentId, 'record')}${RECORD}`);
  }

  async #prune(): Promise<void> {
    const oldest = this.#now() - MAX_AGE_MS;
    for (const name of await readdir(this.#directory)) {
      if (!name.endsWith(RECORD) && !name.endsWith(IN_HAND)) continue;
      const file = join(this.#directory, name);
      try {
        if ((await stat(file)).mtimeMs < oldest) await rm(file, { force: true });
      } catch {
        // A file that vanished between the listing and the check is a file this does not have to remove.
      }
    }
  }
}

/** An id is not a file name until this makes it one: no separator, no `..` of its own, no length worth worrying about. */
function safe(id: string, otherwise: string): string {
  const name = id.replace(UNSAFE, '-').slice(0, 80);
  return name === '' ? otherwise : name;
}

/** A name no other run has, beside the record it stands for. */
function inHand(file: string): string {
  return `${file}.${randomUUID()}${IN_HAND}`;
}

async function readRecord(file: string): Promise<RememberedAlert | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
    return isRemembered(parsed) ? parsed : undefined;
  } catch {
    // A missing file is the common case; a half-written one is the same answer, because nothing here is authoritative.
    return undefined;
  }
}

function present(records: readonly (RememberedAlert | undefined)[]): readonly RememberedAlert[] {
  return records.filter((record) => record !== undefined);
}

function codeOf(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

/** Read from a file this process wrote, and still checked: a shape that does not hold is a record that is not there. */
function isRemembered(value: unknown): value is RememberedAlert {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.agentId === 'string' && typeof record.level === 'string' && typeof record.words === 'string' &&
    (record.counts === undefined || areCounts(record.counts)) && (record.notByRule === undefined || record.notByRule === true) &&
    (record.told === undefined || record.told === true) && (record.data === undefined || record.data === true) &&
    (record.named === undefined || record.named === true) && (record.stopped === undefined || record.stopped === true);
}

/** Counts that are not whole numbers are counts this did not write: the record is read as one without them. */
function areCounts(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const counts = value as Record<string, unknown>;
  return Number.isInteger(counts.values) && Number.isInteger(counts.reached) &&
    [counts.told, counts.data, counts.named, counts.stopped].every((count) => count === undefined || Number.isInteger(count));
}
