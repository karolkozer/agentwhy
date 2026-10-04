// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
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

  /**
   * Whether a folder is there and can be read: listed, not only seen, since a sandbox may show a folder it will not let
   * an app list - and from inside it that is the same as no folder. An error the port names is "no", and nothing else
   * is swallowed.
   */
  async #canList(path: string): Promise<boolean> {
    try {
      await this.#directories.list(path);
      return true;
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return false;
    }
  }

  async list(workingDirectory: string): Promise<SessionListing> {
    const root = join(this.#home, ...PROJECTS_DIRECTORY);
    const { directory, storeListed } = await this.#directoryFor(root, workingDirectory);

    let entries;
    try {
      entries = await this.#directories.list(directory);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      // Not found is an answer, not a failure: this project may simply never have been worked on here. Whether Claude
      // Code keeps any conversations here at all is the other half of the answer (R28, amended 2026-10-01).
      const store = (storeListed ?? (await this.#canList(root))) ? {} : { store: 'missing' as const };
      return { directory, found: false, searched: [{ provider: 'claude-code', directory, found: false, ...store }], sessions: [] };
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
   * directory instead of trusting the guess. Where the store was listed for that, whether it could be is said too, so
   * it is not asked again.
   */
  async #directoryFor(root: string, workingDirectory: string): Promise<{ readonly directory: string; readonly storeListed?: boolean }> {
    const derived = join(root, projectDirectoryName(workingDirectory));

    try {
      if ((await this.#directories.kindOf(derived)) === 'directory') return { directory: derived };
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
    }

    try {
      const stored = await this.#directories.list(root);
      const match = stored.find((entry) => entry.kind === 'directory' && matchesProject(entry.name, workingDirectory));
      return { directory: match === undefined ? derived : join(root, match.name), storeListed: true };
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return { directory: derived, storeListed: false };
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
