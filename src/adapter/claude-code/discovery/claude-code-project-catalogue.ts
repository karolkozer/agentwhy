// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { basename, join } from 'node:path';
import type { ProjectCatalogue, ProjectListing, ProjectSummary } from '../../../core/project-catalogue.ts';
import type { Redactor } from '../../../core/redaction/redactor.ts';
import type { SessionRecognition } from '../../../core/session-titles.ts';
import { isDirectory, type DirectoryReader } from '../../../ports/directory-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileTailReader } from '../../../ports/file-tail-reader.ts';
import { LAYOUT } from '../contract/layout.ts';
import { PROJECTS_DIRECTORY, matchesProject } from '../contract/projects.ts';
import { SESSION_TITLE } from '../contract/session-title.ts';
import type { ClaudeDesktopTitles } from './claude-desktop-titles.ts';
import { recognitionIn, workingDirectoryIn } from './transcript-tail.ts';

export interface ProjectCatalogueDependencies {
  readonly directories: DirectoryReader;
  readonly transcripts: FileTailReader;
  /** Only the free-text door: a title is whatever a model wrote from what the user typed. */
  readonly redactor: Pick<Redactor, 'scan'>;
  readonly home: string;
  /**
   * Folders not to look into (`which-project.md` V10b): where the system asks the person before an app reads. Chosen by
   * the composition root, which knows the system and the folder the run works in. Absent, every folder is looked at.
   */
  readonly leaveAlone?: (folder: string) => boolean;
  /**
   * The Claude desktop app's own names, where the platform has them (`claude-desktop-conversations.md` CD2, CD3): a
   * newest conversation the app held has no `ai-title`, so its row in the list of projects is titled by the app's file.
   */
  readonly desktop?: Pick<ClaudeDesktopTitles, 'titleOf'>;
}

/**
 * How many transcripts of one project are read, newest first, to find its folder. The newest said it for 14 of 14
 * projects measured (`which-project.md` VB5); a session begun a moment ago may not have a conversation line yet.
 */
const READS_PER_PROJECT = 3;

/**
 * How many projects are read at once. Each holds up to a megabyte of a transcript's end, and a descriptor for it, until
 * it answers; every project at once would hold all of that at the same moment, as `start`'s titles would.
 */
const PROJECTS_AT_ONCE = 8;

/**
 * The projects Claude Code keeps conversations for, under `~/.claude/projects/` (`.ai/specs/2026-09-27-which-project.md`
 * V9). A directory's name is a lossy encoding of the project's path (§13.2 pitfall 6), so the path is the `cwd` a
 * conversation carries that matches the name - one conversation can carry several (contract v12) - and a directory whose
 * conversations carry none is counted, never decoded. One transcript's end is read per project, the newest, and one or
 * two more only where it does not say the folder.
 */
export class ClaudeCodeProjectCatalogue implements ProjectCatalogue {
  readonly #dependencies: ProjectCatalogueDependencies;

  constructor(dependencies: ProjectCatalogueDependencies) {
    this.#dependencies = dependencies;
  }

  async list(): Promise<ProjectListing> {
    const root = join(this.#dependencies.home, ...PROJECTS_DIRECTORY);
    let entries;
    try {
      entries = await this.#dependencies.directories.list(root);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      // No conversations kept on this computer at all is an answer, not a failure.
      return { projects: [], unreadable: 0 };
    }

    const directories = entries.filter((entry) => entry.kind === 'directory');
    const found: (ProjectSummary | 'unreadable' | undefined)[] = [];
    for (let from = 0; from < directories.length; from += PROJECTS_AT_ONCE) {
      const batch = directories.slice(from, from + PROJECTS_AT_ONCE);
      found.push(...(await Promise.all(batch.map((entry) => this.#project(join(root, entry.name), entry.name)))));
    }

    const projects = found.filter((project): project is ProjectSummary => project !== undefined && project !== 'unreadable');
    const unreadable = found.filter((project) => project === 'unreadable').length;
    return { projects: projects.sort((a, b) => b.newest.modifiedAt - a.newest.modifiedAt), unreadable };
  }

  /** One directory as a project; `undefined` where it keeps no conversation, `unreadable` where none says the folder. */
  async #project(directory: string, id: string): Promise<ProjectSummary | 'unreadable' | undefined> {
    const transcripts = await this.#transcripts(directory);
    const newest = transcripts[0];
    if (newest === undefined) return undefined;

    let path: string | undefined;
    let recognised: SessionRecognition = {};
    for (const [at, transcript] of transcripts.slice(0, READS_PER_PROJECT).entries()) {
      const tail = await this.#tail(transcript.path);
      if (tail === undefined) continue;
      if (at === 0) recognised = recognitionIn(tail, this.#dependencies.redactor);
      path = workingDirectoryIn(tail, (cwd) => matchesProject(id, cwd));
      if (path !== undefined) break;
    }
    if (path === undefined) return 'unreadable';

    // CD2: a conversation the Claude desktop app held has no `ai-title`; its row is titled by the app's own name,
    // through this list's redactor, as the transcript's title would be.
    if (recognised.title === undefined && this.#dependencies.desktop !== undefined) {
      const named = await this.#dependencies.desktop.titleOf(basename(newest.path, LAYOUT.transcriptSuffix));
      if (named !== undefined) recognised = { ...recognised, title: this.#dependencies.redactor.scan(named) };
    }

    return {
      id,
      path,
      folder: this.#dependencies.leaveAlone?.(path) === true ? 'not-looked' : (await isDirectory(this.#dependencies.directories, path)) ? 'there' : 'gone',
      conversations: transcripts.length,
      newest: { modifiedAt: newest.modifiedAt, ...recognised },
    };
  }

  /** The directory's transcripts, newest first. The files inside a session's own directory are not conversations. */
  async #transcripts(directory: string): Promise<readonly { readonly path: string; readonly modifiedAt: number }[]> {
    const { directories } = this.#dependencies;
    let entries;
    try {
      entries = await directories.list(directory);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return [];
    }
    const found = await Promise.all(
      entries
        .filter((entry) => entry.kind === 'file' && entry.name.endsWith(LAYOUT.transcriptSuffix))
        .map(async (entry) => {
          const path = join(directory, entry.name);
          return { path, modifiedAt: await this.#modifiedAt(path) };
        }),
    );
    return found.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  async #tail(path: string): Promise<string | undefined> {
    try {
      return await this.#dependencies.transcripts.readTail(path, SESSION_TITLE.tailBytes);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return undefined;
    }
  }

  async #modifiedAt(path: string): Promise<number> {
    try {
      return await this.#dependencies.directories.modifiedAt(path);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return 0;
    }
  }
}
