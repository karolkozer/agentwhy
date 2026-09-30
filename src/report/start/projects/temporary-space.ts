import { isAbsolute, relative, sep } from 'node:path';

/** Where systems keep what is thrown away: `/tmp`, and on macOS the per-person folders `TMPDIR` points into. */
const SYSTEM_TEMPORARY = ['/tmp', '/private/tmp', '/var/tmp', '/private/var/tmp', '/var/folders', '/private/var/folders'];

/**
 * Whether a folder lies in the computer's temporary space - where a quick try with the agent is started, and nobody keeps a
 * project (`.ai/specs/2026-09-27-which-project.md` V10, the maintainer's design: "Hidden: 1 temporary folder"). The run's
 * own temporary directory counts, reached through `/private` too, since macOS reports a folder's path with every link
 * followed. A home directory that itself lies there - a test's, a sandbox's - keeps its folders: they are its projects.
 */
export function inTemporarySpace(path: string, temporaryDirectory: string, home: string | undefined): boolean {
  const roots = [temporaryDirectory, ...(temporaryDirectory.startsWith('/var/') ? [`/private${temporaryDirectory}`] : []), ...SYSTEM_TEMPORARY];
  return roots.some((root) => within(root, path) && !(home !== undefined && home !== '' && within(root, home) && (within(home, path) || relative(home, path) === '')));
}

/** Whether `path` lies under `folder`, and is not `folder` itself. */
function within(folder: string, path: string): boolean {
  const between = relative(folder, path);
  return between !== '' && between !== '..' && !between.startsWith(`..${sep}`) && !isAbsolute(between);
}
