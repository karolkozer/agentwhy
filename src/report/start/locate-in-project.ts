// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import type { DirectoryReader } from '../../ports/directory-reader.ts';
import { FileAccessError } from '../../ports/file-access-error.ts';

/**
 * What the add window hands over for one pick (`for-people-who-build-with-ai.md` F36, `several-at-once` AS5): a name and
 * never a path, which is all a browser gives a page, and for a folder the names inside it, as `webkitRelativePath` gives
 * them below the folder's own name.
 */
export interface Pick {
  readonly name: string;
  readonly kind: 'file' | 'folder';
  readonly inside?: readonly string[];
}

/** One place a pick's name was found: its path from the project's folder, written with `/`, and whether it is a tool's. */
export interface Located {
  readonly path: string;
  readonly tool: boolean;
}

export interface LocateAnswer {
  readonly name: string;
  readonly kind: 'file' | 'folder';
  readonly paths: readonly Located[];
  /** `false` where the bound was reached before every folder was listed (FND4): the page says so. */
  readonly complete: boolean;
}

/** `2026-10-09-the-file-not-its-name.md` FND4: how many entries are listed before the answer says it looked in part. */
export const LOCATE_BOUND = 200_000;

/** How many folders are listed at once. */
const AT_ONCE = 32;

/**
 * FND3: folders a tool fills, whose files are listed after the project's own - `package.json` was found 319 times in one
 * project, nearly all of them in `node_modules` (FNB13).
 */
const TOOL_FOLDERS = new Set(['node_modules', '.venv', 'venv', '.git', 'dist', 'build', '.next', '.cache', '.turbo', '__pycache__', 'vendor', '.idea', '.vscode']);

/**
 * `2026-10-09-the-file-not-its-name.md` FN3: the files and folders of the project that carry each picked name, found by
 * listing folders - names and kinds, through the port that can do nothing else - so no file is ever opened (F36 holds).
 * A link is not followed: its kind is neither file nor folder, which also keeps a link loop from being walked. Every
 * pick is answered from one walk.
 */
export async function locateInProject(directories: DirectoryReader, project: string, picks: readonly Pick[], bound = LOCATE_BOUND): Promise<readonly LocateAnswer[]> {
  const files = new Map<string, string[]>(picks.filter((pick) => pick.kind === 'file').map((pick) => [pick.name, []]));
  const folders = new Map<string, string[]>(picks.filter((pick) => pick.kind === 'folder').map((pick) => [pick.name, []]));
  // The project's own folders first, and a tool's after: breadth first through both, `node_modules` and `.git` ran the
  // bound out before a project's deeper folders were reached (the review of 2026-10-09). Folders are listed a few dozen at
  // a time rather than one after another.
  const own: string[] = [''];
  const later: string[] = [];
  let seen = 0;
  let complete = true;
  const visit = async (queue: string[], deferring: boolean): Promise<void> => {
    // By what was taken, not by AT_ONCE: the queue grows as it is read, and a short batch is followed by what it found.
    for (let next = 0; next < queue.length && complete;) {
      const batch = queue.slice(next, next + AT_ONCE);
      next += batch.length;
      const listings = await Promise.all(batch.map((folder) => listed(directories, folder === '' ? project : join(project, ...folder.split('/')))));
      listings.forEach((entries, at) => {
        const folder = batch[at] ?? '';
        for (const entry of entries) {
          if (!complete) return;
          seen += 1;
          if (seen > bound) {
            complete = false;
            return;
          }
          const path = folder === '' ? entry.name : `${folder}/${entry.name}`;
          if (entry.kind === 'directory') {
            (deferring && TOOL_FOLDERS.has(entry.name) ? later : queue).push(path);
            folders.get(entry.name)?.push(path);
          } else if (entry.kind === 'file') {
            files.get(entry.name)?.push(path);
          }
        }
      });
    }
  };
  await visit(own, true);
  await visit(later, false);

  const answers: LocateAnswer[] = [];
  for (const pick of picks) {
    const found = (pick.kind === 'file' ? files : folders).get(pick.name) ?? [];
    const kept = pick.kind === 'folder' && pick.inside !== undefined && pick.inside.length > 0
      ? await holding(directories, project, found, pick.inside)
      : found;
    answers.push({ name: pick.name, kind: pick.kind, paths: ordered(kept), complete });
  }
  return answers;
}

/** A folder's entries, or none where it cannot be listed: a folder nobody may read is no place a pick was found. */
async function listed(directories: DirectoryReader, path: string): Promise<Awaited<ReturnType<DirectoryReader['list']>>> {
  try {
    return await directories.list(path);
  } catch (error) {
    if (!(error instanceof FileAccessError)) throw error;
    return [];
  }
}

/** FN4: of the folders found by name, those holding every name the pick says it held at its top - by name, never opened. */
async function holding(directories: DirectoryReader, project: string, found: readonly string[], inside: readonly string[]): Promise<string[]> {
  const top = new Set(inside.map((name) => name.split('/')[0] ?? '').filter((name) => name !== ''));
  const kept: string[] = [];
  for (const folder of found) {
    const names = new Set((await listed(directories, join(project, ...folder.split('/')))).map((entry) => entry.name));
    if ([...top].every((name) => names.has(name))) kept.push(folder);
  }
  return kept;
}

/** FND3: the project's own paths first, then a tool's, each in the order a person reads a list of paths. */
function ordered(paths: readonly string[]): Located[] {
  const located = paths.map((path) => ({ path, tool: path.split('/').some((segment) => TOOL_FOLDERS.has(segment)) }));
  return [...located.filter((one) => !one.tool).sort(byPath), ...located.filter((one) => one.tool).sort(byPath)];
}

function byPath(one: Located, other: Located): number {
  return one.path < other.path ? -1 : one.path > other.path ? 1 : 0;
}
