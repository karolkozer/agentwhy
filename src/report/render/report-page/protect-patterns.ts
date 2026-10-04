// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { insideProject } from '../../../core/project-root.ts';
import { nameOf } from './item-names.ts';

/**
 * What **Protect it** writes for one file (the report page spec P38a, P38b): its own path, or, where the person ticks
 * the option, every file of its name. Taken from the path the record already names; nothing is opened to write it.
 */
export interface ProtectPatterns {
  /** `./data/exports/customers.csv` - the file, and only it. */
  readonly exact: string;
  /** `**` + `/customers.csv` - every file of that name, wherever it is in the project. */
  readonly every: string;
}

/**
 * The patterns for a file the report names inside the project, or `undefined`: a display path is relative only where
 * the file lies under the project root (`path-display-and-share` R1), and a rule written from an absolute path or one
 * that climbs out would protect something the page cannot name for the person. A shared page writes nothing (P46).
 */
export function protectPatterns(path: string, shared: boolean): ProtectPatterns | undefined {
  // With no root given, only a relative path that does not climb is inside; `~` names a home, whatever `isAbsolute` says.
  if (shared || path.startsWith('~') || !insideProject(path, { kind: 'absent' })) return undefined;
  return { exact: './' + path.replace(/^\.\//, ''), every: '**/' + nameOf(path) };
}
