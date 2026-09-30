import { dirname, join } from 'node:path';
import type { DirectoryReader } from '../../ports/directory-reader.ts';
import { FileAccessError } from '../../ports/file-access-error.ts';

/**
 * The working tree a directory sits inside, if any. `start` writes files that describe other people's sessions,
 * and a working tree is where a file gets committed without anyone deciding to (spec R5).
 *
 * Asked of every ancestor, not only the directory itself - `--out ./reports` inside a repository is inside it -
 * and a `.git` **file** counts as much as a directory, because that is how a worktree records where it belongs.
 * A directory that does not exist yet is not a reason to stop looking: its parents do.
 */
export async function repositoryAbove(path: string, directories: DirectoryReader): Promise<string | undefined> {
  let here = path;

  for (;;) {
    try {
      const kind = await directories.kindOf(join(here, '.git'));
      if (kind === 'directory' || kind === 'file') return here;
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
    }

    const parent = dirname(here);
    if (parent === here) return undefined;
    here = parent;
  }
}
