// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import type { DirectoryReader } from '../ports/directory-reader.ts';
import { FileAccessError } from '../ports/file-access-error.ts';

/** GD14's rows, by the name a page's words find each one under. */
export type GlobalDefaultId =
  | 'ssh'
  | 'aws'
  | 'azure'
  | 'gcloud'
  | 'github'
  | 'git-credentials'
  | 'gnupg'
  | 'kube'
  | 'docker'
  | 'netrc';

/** One row the computer-wide path offers before a person adds anything, for the system the computer runs. */
export interface GlobalDefault {
  readonly id: GlobalDefaultId;
  /** Where it is under the home directory, `/`-separated whatever the system: the form a pattern is written in. */
  readonly path: string;
  /** A folder is protected with everything in it; a file alone. */
  readonly kind: 'folder' | 'file';
  /**
   * The pattern `GlobalSetup` writes for it: its place under the home, `~/.ssh/**` and `~/.netrc`
   * (`2026-10-07-a-file-in-its-place.md` IP6) - the form Claude Code applies wherever it works (IPB6, IPB11). On Windows,
   * where `~/` is not measured (IPB13), still the anchored `**\/…` of GD3.
   */
  readonly pattern: string;
  /** The anchored form GD3 wrote before IP6, by which a row written then is known, to be brought along (IPD1). */
  readonly legacy?: string;
}

export interface FoundDefault extends GlobalDefault {
  /** Whether it is on this computer: shown ticked if so, folded unticked if not (GD14). */
  readonly present: boolean;
}

interface Row {
  readonly id: GlobalDefaultId;
  readonly kind: 'folder' | 'file';
  readonly unix: string;
  /** Where Windows keeps it, where that is not the same place. */
  readonly windows?: string;
}

/*
 * `2026-10-05-protected-everywhere.md` GD14: only what lives in the home directory and almost never inside a project.
 * A computer-wide rule cannot be lifted by a project (G15), and `**\/name` matches that name everywhere, so a default
 * that also names files projects keep would take every project's own choice away. That is why `.env*`, `*.pem`,
 * `secrets/` and `.npmrc` are not here: they stay `DEFAULT_POLICY`'s, per project, where a project can say otherwise.
 * The Windows column is documented, not measured (GB13).
 */
const ROWS: readonly Row[] = [
  { id: 'ssh', kind: 'folder', unix: '.ssh' },
  { id: 'aws', kind: 'folder', unix: '.aws' },
  { id: 'azure', kind: 'folder', unix: '.azure' },
  { id: 'gcloud', kind: 'folder', unix: '.config/gcloud', windows: 'AppData/Roaming/gcloud' },
  { id: 'github', kind: 'folder', unix: '.config/gh', windows: 'AppData/Roaming/GitHub CLI' },
  { id: 'git-credentials', kind: 'file', unix: '.git-credentials' },
  { id: 'gnupg', kind: 'folder', unix: '.gnupg', windows: 'AppData/Roaming/gnupg' },
  { id: 'kube', kind: 'folder', unix: '.kube' },
  { id: 'docker', kind: 'file', unix: '.docker/config.json' },
  { id: 'netrc', kind: 'file', unix: '.netrc', windows: '_netrc' },
];

/** GD14's rows as the system the computer runs keeps them: Windows its own column, every other system the first. */
export function globalDefaults(platform: string): readonly GlobalDefault[] {
  return ROWS.map(({ id, kind, unix, windows }) => {
    const path = platform === 'win32' ? windows ?? unix : unix;
    const anchored = kind === 'folder' ? `**/${path}/**` : `**/${path}`;
    return platform === 'win32'
      ? { id, kind, path, pattern: anchored }
      : { id, kind, path, pattern: kind === 'folder' ? `~/${path}/**` : `~/${path}`, legacy: anchored };
  });
}

/**
 * Which of GD14's rows are on this computer. Asked of the directory tree alone - whether something is at the path -
 * so nothing in a credentials file is ever read to answer it. Anything there counts, whatever its kind, and so does a
 * path that could not be looked at: a row ticked that did not need to be blocks a path nothing uses, and one left
 * folded that was needed protects nothing. Only "not there" folds a row.
 */
export async function defaultsOnThisComputer(directories: DirectoryReader, home: string, platform: string): Promise<readonly FoundDefault[]> {
  return Promise.all(globalDefaults(platform).map(async (row) => ({ ...row, present: await isThere(directories, join(home, ...row.path.split('/'))) })));
}

async function isThere(directories: DirectoryReader, path: string): Promise<boolean> {
  try {
    await directories.kindOf(path);
    return true;
  } catch (error) {
    if (!(error instanceof FileAccessError)) throw error;
    return error.failure !== 'not-found';
  }
}
