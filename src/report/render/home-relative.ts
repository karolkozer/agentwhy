// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * Where a folder is, as a person reads it (`.ai/specs/2026-09-27-which-project.md` V1): `~/Projects/shop` under the home
 * directory, and the path as it is anywhere else. The home directory itself is `~`. `relative` decides what lies under
 * home, so a folder whose name merely begins like it (`/srv/home-else` beside `/srv/home`) is not shortened, and a Windows path is
 * compared as its file system compares it. An empty home names no directory, so nothing is shortened.
 */
export function homeRelative(path: string, home: string): string {
  if (home === '') return path;
  const inside = relative(resolve(home), resolve(path));
  if (inside === '') return '~';
  // `..` or `../…` climbs out of home; a folder of home whose own name begins with two dots does not.
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) return path;
  return `~${sep}${inside}`;
}
