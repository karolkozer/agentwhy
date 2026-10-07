// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join, relative } from 'node:path';
import { SETTINGS_FILES } from '../../../adapter/claude-code/contract/settings.ts';
import { projectDirectoryName } from '../../../adapter/claude-code/contract/projects.ts';
import type { ProjectListing, ProjectSummary } from '../../../core/project-catalogue.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import type { RemovedProjects } from '../../../ports/removed-projects.ts';
import { homeRelative } from '../../render/home-relative.ts';
import { projectName } from '../app-nav.ts';
import type { IndexProject, IndexProjects } from '../session-index.ts';
import { readSettingsFile, runsAgentwhy } from '../settings-files.ts';

export interface IndexProjectsSources {
  /** Each project's own settings files, read as this run reads its own. */
  readonly files: FileReader;
  /**
   * The projects the person took off their list (`.ai/specs/2026-10-06-remove-a-project-from-the-list.md` RM6): left
   * out of the rows, so every place the list is drawn leaves them out (RMD5) and nothing lists them again (RM11).
   */
  readonly removed?: Pick<RemovedProjects, 'removedFrom'>;
  readonly home: string;
  /** The project this page is about. */
  readonly workingDirectory: string;
  /** A folder that is no project - the home directory, a root - is not listed (V6), though conversations are kept for it. */
  readonly noProject: (path: string) => boolean;
  /** A folder in the computer's temporary space: not listed, and counted, as the maintainer's design says (V10). */
  readonly temporary?: (path: string) => boolean;
  /** Whether the run can show another project in this tab (V14). */
  readonly switchable: boolean;
  /** Whether it can open the computer's folder window as well (V12). */
  readonly choosable: boolean;
  /** Whether a project can be taken off this list from the page (RM4): the run keeps the person's own record. */
  readonly removable: boolean;
}

/**
 * The person's projects as the window draws them (`.ai/specs/2026-09-27-which-project.md` V10): where each is, whether
 * its folder is there, and whether it is set up - W23's two facts, read from the folder's own settings and the record of
 * finished onboardings. Nothing is said of a folder that is gone, or whose settings could not be read.
 */
export async function indexProjects(listing: ProjectListing, sources: IndexProjectsSources): Promise<IndexProjects> {
  const projects = listing.projects.filter((project) => !sources.noProject(project.path));
  const temporary = sources.temporary;
  const listed = temporary === undefined ? projects : projects.filter((project) => !temporary(project.path));
  const rows = await Promise.all(listed.map(async (project): Promise<IndexProject> => {
    // V10b: a folder not looked at is not read for its settings either.
    const setUp = project.folder === 'there' ? await setUpIn(project, sources.files) : undefined;
    return {
      id: project.id,
      place: homeRelative(project.path, sources.home),
      name: projectName(project.path),
      folder: project.folder,
      conversations: project.conversations,
      newest: project.newest,
      ...(setUp === undefined ? {} : { setUp }),
      current: relative(project.path, sources.workingDirectory) === '',
    };
  }));
  const hidden = projects.length - listed.length;
  // RM13: a project the record could not be read for is listed as it is today - nothing is hidden from a guess - and
  // the project this page is about is never hidden, whatever a hand-edited line says (RMD3).
  const gone = await sources.removed?.removedFrom(listed.map((project) => projectDirectoryName(project.path)));
  const taken = (row: IndexProject, project: ProjectSummary): boolean => !row.current && gone !== undefined && gone.has(projectDirectoryName(project.path));
  const kept = rows.filter((row, at) => !taken(row, listed[at] as ProjectSummary));
  return {
    rows: kept,
    unreadable: listing.unreadable,
    ...(hidden === 0 ? {} : { temporary: hidden }),
    switchable: sources.switchable,
    choosable: sources.choosable,
    removable: sources.removable,
  };
}

/**
 * Set up where agentwhy runs - one of its hooks, in the project's settings (`runsAgentwhy`, the maintainer, 2026-10-07):
 * a project whose settings only block files, or whose onboarding was once finished, runs nothing of agentwhy's. Unknown
 * where a settings file cannot be read.
 */
async function setUpIn(project: ProjectSummary, files: FileReader): Promise<boolean | undefined> {
  const directory = join(project.path, SETTINGS_FILES.directory);
  const local = await readSettingsFile(files, join(directory, SETTINGS_FILES.local));
  const shared = await readSettingsFile(files, join(directory, SETTINGS_FILES.shared));
  if (runsAgentwhy([local, shared])) return true;
  return local === 'unreadable' || shared === 'unreadable' ? undefined : false;
}
