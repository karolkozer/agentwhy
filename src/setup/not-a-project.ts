// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { parse, relative, resolve } from 'node:path';

/** Why a directory is not a project: the person's home directory, or the root of a file system. */
export type NotAProject = 'home' | 'root';

/**
 * Why a working directory is not a project, or `undefined` where it may be one (`.ai/specs/2026-09-27-which-project.md`
 * V6). The home directory is where a new terminal starts, and its `.claude/settings.json` is Claude Code's settings for
 * every project; a root is nobody's project. Compared as resolved paths, and through `relative`, which compares a Windows
 * path without regard to case, as its file system does. An empty home names no directory, so it matches none.
 *
 * `realHome` is the same directory with every link followed. Found by a review: the working directory a shell gives is
 * the physical path, while `HOME` may reach it through a link - `/home` a link to `/data/home` - so the two named one
 * directory and were compared as two, and the home directory was set up as a project.
 */
export function notAProject(directory: string, home: string, realHome: string = home): NotAProject | undefined {
  const resolved = resolve(directory);
  if ([home, realHome].some((one) => one !== '' && relative(resolve(one), resolved) === '')) return 'home';
  if (parse(resolved).root === resolved) return 'root';
  return undefined;
}
