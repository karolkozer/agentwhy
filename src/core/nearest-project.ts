// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, relative, sep } from 'node:path';
import type { ProjectListing, ProjectSummary } from './project-catalogue.ts';

/**
 * Where a folder stands among the listed projects (`.ai/specs/2026-09-27-which-project.md` V12, V20): it is one; it lies
 * inside one, which is where the agent keeps its conversations; projects lie inside it; or none is near. A person picks
 * `my-app/src` or `Projects` as readily as `my-app`, and the agent keeps a project under the folder the editor opened.
 */
export type NearestProject =
  | { readonly kind: 'itself'; readonly project: ProjectSummary }
  | { readonly kind: 'above'; readonly project: ProjectSummary }
  | { readonly kind: 'inside'; readonly projects: readonly ProjectSummary[] }
  | { readonly kind: 'none' };

/**
 * A folder that is gone cannot be offered, so only projects whose folder is not known to be gone are considered - one not
 * looked at (V10b) is looked at when it is picked. Where the folder lies
 * inside more than one project, the nearest - the deepest - is the one; the projects inside it keep the listing's order.
 * Paths are compared through `relative`, which compares a Windows path without regard to case, as its file system does.
 *
 * Nor is a folder `noProject` names (V6): Claude Code keeps the conversations of whatever folder it was started in, the
 * home directory too, and a new terminal starts there. Found by a review: every folder under the home directory was
 * offered the home directory as the project above it, which setup then refuses.
 */
export function nearestProject(folder: string, listing: ProjectListing, noProject: (path: string) => boolean): NearestProject {
  const present = listing.projects.filter((project) => project.folder !== 'gone' && !noProject(project.path));

  const itself = present.find((project) => relative(project.path, folder) === '');
  if (itself !== undefined) return { kind: 'itself', project: itself };

  const above = present
    .filter((project) => within(project.path, folder))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (above !== undefined) return { kind: 'above', project: above };

  const inside = present.filter((project) => within(folder, project.path));
  return inside.length > 0 ? { kind: 'inside', projects: inside } : { kind: 'none' };
}

/** Whether `path` lies under `folder`, and is not `folder` itself. */
function within(folder: string, path: string): boolean {
  const between = relative(folder, path);
  return between !== '' && between !== '..' && !between.startsWith(`..${sep}`) && !isAbsolute(between);
}
