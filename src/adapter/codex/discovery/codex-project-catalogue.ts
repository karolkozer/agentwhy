import type { ProjectCatalogue, ProjectListing, ProjectSummary } from '../../../core/project-catalogue.ts';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import { conversationsIn } from './codex-conversations.ts';
import type { CodexSessionIndex } from './codex-session-index.ts';

export interface CodexProjectCatalogueDependencies {
  readonly index: CodexSessionIndex;
  readonly directories: DirectoryReader;
  readonly sessionsRoot: string;
  /**
   * The id a project's folder is listed under - the one Claude Code gives the same folder, so that a folder with
   * conversations in both AIs is one project (decided 2026-09-29, `.ai/plans/2026-09-29-what-codex-wrote.md`). Chosen
   * by the composition root: this adapter knows no other adapter.
   */
  readonly projectId: (folder: string) => string;
}

/**
 * The projects Codex keeps conversations for (`which-project.md` V9; X4): one per recorded `cwd` of a conversation's
 * first line, named by `projectId` and never decoded from it. A conversation that records no folder is counted, never
 * guessed. Titles and ways in are not read: their sources are not measured for Codex.
 */
export class CodexProjectCatalogue implements ProjectCatalogue {
  readonly #dependencies: CodexProjectCatalogueDependencies;

  constructor(dependencies: CodexProjectCatalogueDependencies) {
    this.#dependencies = dependencies;
  }

  async list(): Promise<ProjectListing> {
    const { index, directories, sessionsRoot, projectId } = this.#dependencies;
    const conversations = await conversationsIn(await index.list(sessionsRoot), directories);
    const byFolder = new Map<string, { conversations: number; newest: number }>();
    let unreadable = 0;
    for (const conversation of conversations) {
      const folder = conversation.source.header.project;
      if (folder === undefined) {
        unreadable += 1;
        continue;
      }
      const known = byFolder.get(folder);
      byFolder.set(folder, {
        conversations: (known?.conversations ?? 0) + 1,
        newest: Math.max(known?.newest ?? 0, conversation.modifiedAt),
      });
    }
    const projects = await Promise.all([...byFolder].map(async ([path, folder]): Promise<ProjectSummary> => ({
      id: projectId(path),
      path,
      exists: await this.#isDirectory(path),
      conversations: folder.conversations,
      newest: { modifiedAt: folder.newest },
    })));
    return { projects: projects.sort((a, b) => b.newest.modifiedAt - a.newest.modifiedAt), unreadable };
  }

  async #isDirectory(path: string): Promise<boolean> {
    try {
      return (await this.#dependencies.directories.kindOf(path)) === 'directory';
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return false;
    }
  }
}
