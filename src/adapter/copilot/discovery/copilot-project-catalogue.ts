// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { ProjectCatalogue, ProjectListing, ProjectSummary } from '../../../core/project-catalogue.ts';
import type { Redactor } from '../../../core/redaction/redactor.ts';
import { isDirectory, type DirectoryReader } from '../../../ports/directory-reader.ts';
import { oneLine } from '../../../shared/printable.ts';
import type { CopilotSession } from './copilot-session-discovery.ts';
import type { CopilotSessionIndex } from './copilot-session-index.ts';

export interface CopilotProjectCatalogueDependencies {
  readonly index: CopilotSessionIndex;
  readonly directories: DirectoryReader;
  readonly sessionsRoot: string;
  /** The id a project's folder is listed under - Claude Code's for the same folder, so a folder of several AIs is one project. */
  readonly projectId: (folder: string) => string;
  /** A title passes the free-text door before any page holds it. */
  readonly redactor: Pick<Redactor, 'scan'>;
  /** Folders not to look into (`which-project.md` V10b). Absent, every folder is looked at. */
  readonly leaveAlone?: (folder: string) => boolean;
}

/**
 * The projects Copilot keeps conversations for (`which-project.md` V9; `what-copilot-wrote` CP3a): one per session folder,
 * named by `projectId` and never decoded from it, recognised by its newest conversation's title (CPB35). Where it was held
 * is not given: a row of the projects window would lose it the day another AI's conversation was newer (WHD5). A session
 * that names no folder, or two, is counted, never guessed. A chat folder of the desktop app is listed as any folder is:
 * which folders are quick tries is the page's to say (CPD8).
 */
export class CopilotProjectCatalogue implements ProjectCatalogue {
  readonly #dependencies: CopilotProjectCatalogueDependencies;

  constructor(dependencies: CopilotProjectCatalogueDependencies) {
    this.#dependencies = dependencies;
  }

  async list(): Promise<ProjectListing> {
    const { index, directories, sessionsRoot, projectId, redactor, leaveAlone } = this.#dependencies;
    const listing = await index.list(sessionsRoot);
    const byFolder = new Map<string, { conversations: number; newest: CopilotSession }>();
    let unreadable = 0;
    for (const session of listing.sessions) {
      if (session.project === undefined) {
        unreadable += 1;
        continue;
      }
      const known = byFolder.get(session.project);
      byFolder.set(session.project, {
        conversations: (known?.conversations ?? 0) + 1,
        newest: known === undefined || session.modifiedAt > known.newest.modifiedAt ? session : known.newest,
      });
    }
    const projects = await Promise.all([...byFolder].map(async ([path, folder]): Promise<ProjectSummary> => {
      const title = folder.newest.title === undefined ? '' : oneLine(folder.newest.title);
      return {
        id: projectId(path),
        path,
        folder: leaveAlone?.(path) === true ? 'not-looked' : (await isDirectory(directories, path)) ? 'there' : 'gone',
        conversations: folder.conversations,
        newest: { modifiedAt: folder.newest.modifiedAt, ...(title === '' ? {} : { title: redactor.scan(title) }) },
      };
    }));
    return { projects: projects.sort((a, b) => b.newest.modifiedAt - a.newest.modifiedAt), unreadable };
  }
}
