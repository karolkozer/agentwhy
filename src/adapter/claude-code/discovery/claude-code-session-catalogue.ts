import { join } from 'node:path';
import type { SessionCatalogue, SessionListing, SessionSummary } from '../../../core/session-catalogue.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import { LAYOUT, parseSubagentFileName } from '../contract/layout.ts';
import { PROJECTS_DIRECTORY, matchesProject, projectDirectoryName } from '../contract/projects.ts';

/**
 * Lists the sessions Claude Code has kept for a project, so that using the tool does not require typing a path
 * that looks like `~/.claude/projects/-Users-someone-Projects-app/<uuid>`.
 *
 * Nothing inside a session is read here: only names, modification times and how many index files each has.
 */
export class ClaudeCodeSessionCatalogue implements SessionCatalogue {
  readonly #directories: DirectoryReader;
  readonly #home: string;

  constructor(directories: DirectoryReader, home: string) {
    this.#directories = directories;
    this.#home = home;
  }

  async list(workingDirectory: string): Promise<SessionListing> {
    const root = join(this.#home, ...PROJECTS_DIRECTORY);
    const directory = await this.#directoryFor(root, workingDirectory);

    let entries;
    try {
      entries = await this.#directories.list(directory);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      // Not found is an answer, not a failure: this project may simply never have been worked on here.
      return { directory, found: false, searched: [{ provider: 'claude-code', directory, found: false }], sessions: [] };
    }

    const sessions = await Promise.all(
      entries
        .filter((entry) => entry.kind === 'file' && entry.name.endsWith(LAYOUT.transcriptSuffix))
        .map((entry) => this.#summarise(directory, entry.name)),
    );

    return {
      directory,
      found: true,
      searched: [{ provider: 'claude-code', directory, found: true }],
      sessions: sessions.sort((a, b) => b.modifiedAt - a.modifiedAt),
    };
  }

  /**
   * The encoded name first, because it costs nothing when it is right. When it is not - and the rule is
   * inferred from examples, so it will not always be - the stored directories are compared against the working
   * directory instead of trusting the guess.
   */
  async #directoryFor(root: string, workingDirectory: string): Promise<string> {
    const derived = join(root, projectDirectoryName(workingDirectory));

    try {
      if ((await this.#directories.kindOf(derived)) === 'directory') return derived;
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
    }

    try {
      const stored = await this.#directories.list(root);
      const match = stored.find((entry) => entry.kind === 'directory' && matchesProject(entry.name, workingDirectory));
      return match === undefined ? derived : join(root, match.name);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return derived;
    }
  }

  async #summarise(directory: string, fileName: string): Promise<SessionSummary> {
    const id = fileName.slice(0, -LAYOUT.transcriptSuffix.length);
    const path = join(directory, id);

    return {
      id,
      path,
      modifiedAt: await this.#modifiedAt(join(directory, fileName)),
      delegations: await this.#delegations(join(path, LAYOUT.subagentsDir)),
      provider: 'claude-code',
    };
  }

  async #modifiedAt(path: string): Promise<number> {
    try {
      return await this.#directories.modifiedAt(path);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return 0;
    }
  }

  /** Counted from the index files, which is the one thing that says a session delegated at all. */
  async #delegations(subagents: string): Promise<number> {
    try {
      const entries = await this.#directories.list(subagents);
      return entries.filter((entry) => parseSubagentFileName(entry.name)?.kind === 'meta').length;
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return 0;
    }
  }
}
