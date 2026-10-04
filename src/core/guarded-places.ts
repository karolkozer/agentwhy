// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join, relative, sep } from 'node:path';

/**
 * Where macOS asks the person before an app reads, under their home directory (`which-project.md` V10b): Desktop,
 * Documents, Downloads, iCloud Drive and the folders other cloud drives keep. **Documented by Apple, measured here only
 * for Documents** (2026-10-01).
 */
const UNDER_HOME = [['Desktop'], ['Documents'], ['Downloads'], ['Library', 'Mobile Documents'], ['Library', 'CloudStorage']] as const;

/** Other disks, removable or on a network: one place each, asked about as a kind rather than by name. */
const VOLUMES = '/Volumes';

/**
 * The guarded place a folder lies in, as the root of that place, or `undefined` where it lies in none. Compared without
 * regard to case, as the file system macOS starts with compares names. A pure answer about a path: nothing is read.
 */
export function guardedPlaceOf(path: string, home: string): string | undefined {
  for (const parts of UNDER_HOME) {
    const root = join(home, ...parts);
    if (sameOrWithin(root, path)) return root;
  }
  if (!within(VOLUMES, path)) return undefined;
  // `within` compared without case; the disk's own name is read from the path once its first part is `/Volumes`'s.
  const disk = relative(VOLUMES, VOLUMES + path.slice(VOLUMES.length)).split(sep)[0];
  return disk === undefined || disk === '' ? undefined : join(VOLUMES, disk);
}

/**
 * Whether a run working in `workingDirectory` must leave `path` alone (V10b): it lies in a guarded place, and not in the
 * one the working directory lies in - which the app agentwhy runs under can read already, or it could not work there.
 */
export function leftAlone(path: string, workingDirectory: string, home: string): boolean {
  const place = guardedPlaceOf(path, home);
  return place !== undefined && place.toLowerCase() !== guardedPlaceOf(workingDirectory, home)?.toLowerCase();
}

function sameOrWithin(folder: string, path: string): boolean {
  return relative(folder.toLowerCase(), path.toLowerCase()) === '' || within(folder, path);
}

function within(folder: string, path: string): boolean {
  const between = relative(folder.toLowerCase(), path.toLowerCase());
  return between !== '' && between !== '..' && !between.startsWith(`..${sep}`) && !isAbsolute(between);
}
