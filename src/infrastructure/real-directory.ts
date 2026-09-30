import { realpathSync } from 'node:fs';

/**
 * A directory as the system names it, every link followed: what a shell's working directory is given as, where `HOME`
 * may reach the same directory through a link (`which-project.md` V6). Where a link cannot be followed - the path is
 * missing, unreadable or a loop - the path as it was given, so a home that cannot be read is compared as it is written.
 * An empty path names no directory and stays empty: `realpathSync` would resolve it to the directory the process
 * stands in, and every run would be standing in its home.
 */
export function realDirectory(path: string): string {
  if (path === '') return path;
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
