// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { basename, isAbsolute, relative, sep } from 'node:path';
import type { ChosenPlace } from '../../ports/place-chooser.ts';

/** A pick the add window takes as chosen: the path shown, its kind, and the pattern a project rule is written as. */
export interface ProjectPlace {
  readonly name: string;
  readonly kind: 'file' | 'folder';
  readonly pattern: string;
}

/**
 * `2026-10-09-the-file-not-its-name.md` FN12 (FND8, FNB22): what the system's own window answered, read for a project's
 * page. A place inside the project is the pick it is - its project-relative path, written as the rule FN5 writes
 * (`./<path>`, a folder with `/**`), with `/` whatever the system - so the person who chose a file in the window is
 * never asked which file they meant again. A place outside the project is named, and the page says it is not in this
 * project (FN4's sentence); the project's own folder is neither, and is sent there too - a rule for the whole project
 * is the computer page's work. The window answers real paths (links followed), so `project` must be one as well.
 */
export function projectPlaces(chosen: readonly ChosenPlace[], project: string): { readonly places: readonly ProjectPlace[]; readonly outside: readonly string[] } {
  const places: ProjectPlace[] = [];
  const outside: string[] = [];
  for (const one of chosen) {
    const within = relative(project, one.path);
    // A climb is `..` or a path through it - a name that only starts with two dots is a file of the project, as
    // `deny-rules.ts`'s `within` reads one (the review of 2026-10-09 found `..env.backup` taken for a climb).
    if (within === '' || within === '..' || within.startsWith('..' + sep) || isAbsolute(within)) {
      outside.push(basename(one.path) || one.path);
      continue;
    }
    const path = within.split(sep).join('/');
    places.push(one.folder
      ? { name: path, kind: 'folder', pattern: './' + path + '/**' }
      : { name: path, kind: 'file', pattern: './' + path });
  }
  return { places, outside };
}
