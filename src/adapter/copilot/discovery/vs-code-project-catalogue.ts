// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { ProjectCatalogue, ProjectListing, ProjectSummary } from '../../../core/project-catalogue.ts';
import type { Redactor } from '../../../core/redaction/redactor.ts';
import { isDirectory, type DirectoryReader } from '../../../ports/directory-reader.ts';
import { oneLine } from '../../../shared/printable.ts';
import type { VsCodeChatDiscovery } from './vs-code-chats.ts';

export interface VsCodeProjectCatalogueDependencies {
  readonly discovery: VsCodeChatDiscovery;
  readonly directories: DirectoryReader;
  /** The id a project's folder is listed under - Claude Code's for the same folder, so a folder of several AIs is one project. */
  readonly projectId: (folder: string) => string;
  /** A title passes the free-text door before any page holds it. */
  readonly redactor: Pick<Redactor, 'scan'>;
  /** Folders not to look into (`which-project.md` V10b). Absent, every folder is looked at. */
  readonly leaveAlone?: (folder: string) => boolean;
}

/**
 * The projects Copilot in VS Code keeps chats for (`which-project.md` V9, `what-vs-code-copilot-wrote` VC5): one per folder
 * a workspace was opened on, named by `projectId`, recognised by its newest chat's title - so a project only VS Code's
 * Copilot worked in is in the projects window and on the computer's page, as one of the CLI's is. Where it was held is not
 * given, as no other AI's projects give it (WHD5). A workspace naming no folder on this computer is counted, never guessed.
 */
export class VsCodeProjectCatalogue implements ProjectCatalogue {
  readonly #dependencies: VsCodeProjectCatalogueDependencies;

  constructor(dependencies: VsCodeProjectCatalogueDependencies) {
    this.#dependencies = dependencies;
  }

  async list(): Promise<ProjectListing> {
    const { discovery, directories, projectId, redactor, leaveAlone } = this.#dependencies;
    const store = await discovery.everyFolder();
    const projects = await Promise.all([...store.folders].map(async ([path, chats]): Promise<ProjectSummary> => {
      const [newest] = chats;
      const title = newest?.title === undefined ? '' : oneLine(newest.title);
      return {
        id: projectId(path),
        path,
        folder: leaveAlone?.(path) === true ? 'not-looked' : (await isDirectory(directories, path)) ? 'there' : 'gone',
        conversations: chats.length,
        newest: { modifiedAt: newest?.modifiedAt ?? 0, ...(title === '' ? {} : { title: redactor.scan(title) }) },
      };
    }));
    return { projects: projects.sort((a, b) => b.newest.modifiedAt - a.newest.modifiedAt), unreadable: store.unlisted };
  }
}
