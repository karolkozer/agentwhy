// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { dirname, join } from 'node:path';
import { projectDirectoryName } from '../../adapter/claude-code/contract/projects.ts';
import { SETTINGS_FILES } from '../../adapter/claude-code/contract/settings.ts';
import { FileAccessError } from '../../ports/file-access-error.ts';
import type { FileReader } from '../../ports/file-reader.ts';
import type { FileWriter } from '../../ports/file-writer.ts';
import { parseJsonObject } from '../../shared/json.ts';

/**
 * The private files a person asked only to be told about (`for-people-who-build-with-ai.md` F57): read by the agent,
 * and said afterwards, never stopped. Claude Code keeps no such list - a deny rule is the only protection it has, and it
 * always stops - so agentwhy keeps it, one list per answer General gives (F56):
 *
 * - **everyone on this project**: `.claude/agentwhy.json`, beside the settings file that goes with the project;
 * - **just me**: in this person's own agentwhy directory, outside the project. Claude Code keeps its own local settings
 *   out of git with a line in the person's global ignore file, which would not cover a file of agentwhy's beside it, and
 *   a list of which files are private, committed by accident, is exactly the kind of leak this tool exists to prevent.
 */
export type ListFile = 'local' | 'shared';

export interface TellListPaths {
  /** Where the two lists of the project a settings file belongs to are; the working directory's where none is named. */
  pathsFor(settingsPath: string | undefined): Readonly<Record<ListFile, string>>;
}

export const TELL_LIST_VERSION = 1;

export function tellListPaths(home: string, workingDirectory: string): TellListPaths {
  return {
    pathsFor: (settingsPath) => {
      // A hook is given `$CLAUDE_PROJECT_DIR/.claude/settings.json`: the project is two directories up.
      const project = settingsPath === undefined ? workingDirectory : dirname(dirname(settingsPath));
      return {
        shared: join(project, SETTINGS_FILES.directory, 'agentwhy.json'),
        local: join(home, '.agentwhy', 'projects', projectDirectoryName(project), 'private-files.json'),
      };
    },
  };
}

/**
 * One list, read. A file that is not there is an empty list; one that cannot be understood is `unreadable`, and the
 * patterns it may hold are not guessed at - the page says so rather than showing a list nobody wrote.
 */
export function readTellList(text: string | undefined): readonly string[] | 'unreadable' {
  if (text === undefined) return [];
  const document = parseJsonObject(text);
  if (document === undefined || document.version !== TELL_LIST_VERSION || !Array.isArray(document.tell)) return 'unreadable';
  const patterns = document.tell.filter((pattern): pattern is string => typeof pattern === 'string' && pattern.trim() !== '');
  return patterns.length === document.tell.length ? [...new Set(patterns.map((pattern) => pattern.trim()))] : 'unreadable';
}

export function writtenTellList(patterns: readonly string[]): string {
  return `${JSON.stringify({ version: TELL_LIST_VERSION, tell: [...new Set(patterns)].sort() }, undefined, 2)}\n`;
}

/** Both lists of a project, each as read. */
export type TellListsRead = Readonly<Record<ListFile, readonly string[] | 'unreadable'>>;

export async function readTellLists(files: FileReader, paths: Readonly<Record<ListFile, string>>): Promise<TellListsRead> {
  return { local: readTellList(await textOf(files, paths.local)), shared: readTellList(await textOf(files, paths.shared)) };
}

/** Every pattern of both lists that could be read: what the policy adds as `tell`. */
export function tellPatterns(read: TellListsRead): readonly string[] {
  return [...new Set([read.local, read.shared].flatMap((list) => (list === 'unreadable' ? [] : list)))];
}

export interface TellListsDependencies {
  readonly files: FileReader;
  readonly writer: FileWriter;
  readonly paths: TellListPaths;
}

/**
 * Writes the lists (F57). The page's switch goes through here and through nothing else, so there is one set of rules
 * for these files; a list that cannot be read is not written over, since that would lose what someone put in it.
 */
export class TellLists {
  readonly #dependencies: TellListsDependencies;

  constructor(dependencies: TellListsDependencies) {
    this.#dependencies = dependencies;
  }

  async read(): Promise<TellListsRead> {
    return readTellLists(this.#dependencies.files, this.#dependencies.paths.pathsFor(undefined));
  }

  /** Adds to one list and takes out of it; `false` where the list could not be read or written. */
  async change(file: ListFile, add: readonly string[], remove: readonly string[]): Promise<boolean> {
    const path = this.#dependencies.paths.pathsFor(undefined)[file];
    const now = readTellList(await textOf(this.#dependencies.files, path));
    if (now === 'unreadable') return false;
    const next = [...now.filter((pattern) => !remove.includes(pattern)), ...add.filter((pattern) => !remove.includes(pattern))];
    if (next.length === now.length && next.every((pattern) => now.includes(pattern))) return true;
    try {
      await this.#dependencies.writer.ensureDirectory(dirname(path));
      await this.#dependencies.writer.writeText(path, writtenTellList(next));
      return true;
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return false;
    }
  }
}

async function textOf(files: FileReader, path: string): Promise<string | undefined> {
  try {
    return await files.readText(path);
  } catch (error) {
    if (!(error instanceof FileAccessError)) throw error;
    return undefined;
  }
}
