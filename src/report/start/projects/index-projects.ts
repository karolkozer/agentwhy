// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join, relative } from 'node:path';
import { SETTINGS_FILES } from '../../../adapter/claude-code/contract/settings.ts';
import { projectDirectoryName } from '../../../adapter/claude-code/contract/projects.ts';
import type { ProjectListing, ProjectSummary } from '../../../core/project-catalogue.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import type { OnboardingStore } from '../../../ports/onboarding-store.ts';
import { homeRelative } from '../../render/home-relative.ts';
import { projectName } from '../app-nav.ts';
import type { IndexProject, IndexProjects } from '../session-index.ts';
import { readSettingsFile, setUpBy } from '../settings-files.ts';

export interface IndexProjectsSources {
  /** Each project's own settings files, read as this run reads its own. */
  readonly files: FileReader;
  readonly onboarding?: Pick<OnboardingStore, 'doneFor'>;
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
  const finished = await sources.onboarding?.doneFor(listed.map((project) => projectDirectoryName(project.path)));
  const rows = await Promise.all(listed.map(async (project): Promise<IndexProject> => {
    // V10b: a folder not looked at is not read for its settings either.
    const setUp = project.folder === 'there' ? await setUpIn(project, sources.files, finished) : undefined;
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
  return { rows, unreadable: listing.unreadable, ...(hidden === 0 ? {} : { temporary: hidden }), switchable: sources.switchable, choosable: sources.choosable };
}

/** Set up where the settings say so (`setUpBy`), or the onboarding was finished; unknown where either is unread. */
async function setUpIn(project: ProjectSummary, files: FileReader, finished: ReadonlySet<string> | undefined): Promise<boolean | undefined> {
  const directory = join(project.path, SETTINGS_FILES.directory);
  const local = await readSettingsFile(files, join(directory, SETTINGS_FILES.local));
  const shared = await readSettingsFile(files, join(directory, SETTINGS_FILES.shared));
  if (setUpBy([local, shared])) return true;
  if (local === 'unreadable' || shared === 'unreadable' || finished === undefined) return undefined;
  return finished.has(projectDirectoryName(project.path));
}
