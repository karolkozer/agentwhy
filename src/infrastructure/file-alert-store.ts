import { lstat, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AlertStore, RememberedAlert } from '../ports/alert-store.ts';

/** One directory of its own, so pruning never looks at a file this tool did not write. */
const DIRECTORY = 'agentwhy-alerts';

/** A session nobody finished leaves a file behind. After this it is swept, whether its turn ever ended or not. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Everything else in a session id is replaced, so no id can name a path of its own. */
const UNSAFE = /[^A-Za-z0-9._-]/g;

/**
 * The alerts of a session, in the system's temporary directory (`specs/2026-09-16-a-notice-in-the-conversation.md`
 * R7): written when `SubagentStop` finds one, read and cleared when `Stop` says it, and swept by age so an
 * abandoned session leaves nothing behind.
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
   */
  async #mine(): Promise<boolean> {
    try {
      const entry = await lstat(this.#directory);
      const owner = this.#user === undefined || entry.uid === this.#user;
      return entry.isDirectory() && owner && (entry.mode & 0o022) === 0;
    } catch {
      return false;
    }
  }

  async remember(sessionId: string, alert: RememberedAlert): Promise<void> {
    try {
      // The owner alone, and the directory first: the system's temporary directory is one `/tmp` shared by every
      // account on a Linux machine, and this directory's name is fixed, so it is a name another account can reach
      // for. A mode of its own keeps what is written here - which protected file an agent reached, and in whose
      // session - out of every other account's reading.
      await mkdir(this.#directory, { recursive: true, mode: 0o700 });
      if (!(await this.#mine())) return;
      await this.#prune();
      const kept = (await this.#read(sessionId)).filter((remembered) => remembered.agentId !== alert.agentId);
      await writeFile(this.#fileFor(sessionId), JSON.stringify([...kept, alert]), { encoding: 'utf8', mode: 0o600 });
    } catch {
      // See the note above: a store that could not write says nothing, and nothing is a state this tool has words for.
    }
  }

  async take(sessionId: string): Promise<readonly RememberedAlert[]> {
    const remembered = await this.#read(sessionId);
    try {
      await rm(this.#fileFor(sessionId), { force: true });
    } catch {
      // Said once is said: if the file survives, the next turn repeats a notice. That is better than losing one.
    }
    return remembered;
  }

  /** A session id is not a file name until this makes it one: no separator, no `..`, no length worth worrying about. */
  #fileFor(sessionId: string): string {
    const safe = sessionId.replace(UNSAFE, '-').slice(0, 80);
    return join(this.#directory, `${safe === '' ? 'session' : safe}.json`);
  }

  async #read(sessionId: string): Promise<RememberedAlert[]> {
    if (!(await this.#mine())) return [];
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#fileFor(sessionId), 'utf8'));
      return Array.isArray(parsed) ? parsed.filter(isRemembered) : [];
    } catch {
      // A missing file is the common case; a half-written one is the same answer, because nothing here is authoritative.
      return [];
    }
  }

  async #prune(): Promise<void> {
    const oldest = this.#now() - MAX_AGE_MS;
    for (const name of await readdir(this.#directory)) {
      if (!name.endsWith('.json')) continue;
      const file = join(this.#directory, name);
      try {
        if ((await stat(file)).mtimeMs < oldest) await rm(file, { force: true });
      } catch {
        // A file that vanished between the listing and the check is a file this does not have to remove.
      }
    }
  }
}

/** Read from a file this process wrote, and still checked: a shape that does not hold is a record that is not there. */
function isRemembered(value: unknown): value is RememberedAlert {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.agentId === 'string' && typeof record.level === 'string' && typeof record.words === 'string' &&
    (record.counts === undefined || areCounts(record.counts));
}

/** Counts that are not two whole numbers are counts this did not write: the record is read as one without them. */
function areCounts(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const counts = value as Record<string, unknown>;
  return Number.isInteger(counts.values) && Number.isInteger(counts.reached);
}
