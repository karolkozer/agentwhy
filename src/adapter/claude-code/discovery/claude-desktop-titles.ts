// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import type { DirectoryEntry, DirectoryReader } from '../../../ports/directory-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { parseJsonObject } from '../../../shared/json.ts';
import { oneLine } from '../../../shared/printable.ts';
import { DESKTOP_SESSIONS, isDesktopSessionFileName } from '../contract/desktop-sessions.ts';

export interface ClaudeDesktopTitlesDependencies {
  readonly directories: Pick<DirectoryReader, 'list' | 'modifiedAt'>;
  readonly files: FileReader;
  /**
   * The app's folder of session files (`DESKTOP_SESSIONS.folder` under the home directory), or nothing on a platform
   * where it is not measured (CD6) - then nothing is looked for. Chosen by the composition root, which knows the system.
   */
  readonly folder?: string;
}

/** What one file said, kept so an unchanged file is never read twice (CD5). The title is raw until a caller scans it. */
interface ReadFile {
  readonly modifiedAt: number;
  readonly id?: string;
  readonly title?: string;
}

/**
 * The names the Claude desktop app gave its conversations, for the ones whose transcripts hold no `ai-title`
 * (`.ai/specs/2026-10-01-claude-desktop-conversations.md` CD2). Each file is read for `cliSessionId` and `title` and
 * nothing else is kept, counted or handed out (CD4); the whole walk answers nothing where the folder is missing or
 * unreadable, which on a computer without the app is the ordinary case. The app names a conversation at its first turn,
 * which can be after a list first showed it, so every ask walks the folders again - a look at their listings - while a
 * file is read again only where it changed (CD5). A title leaves here raw: every caller passes it through its own
 * redactor before anything shows it (§13.2 pitfall 7), exactly as `ai-title` is handled.
 */
export class ClaudeDesktopTitles {
  readonly #dependencies: ClaudeDesktopTitlesDependencies;
  /** By file path. A file that could not be read is not kept, so the next ask tries it again. */
  readonly #read = new Map<string, ReadFile>();
  /** The walk in flight, shared by the asks of one batch so eight rows cost one walk. */
  #names: Promise<ReadonlyMap<string, string>> | undefined;

  constructor(dependencies: ClaudeDesktopTitlesDependencies) {
    this.#dependencies = dependencies;
  }

  /** The app's name for this session, raw, or nothing - which a caller never tells apart from "no app here". */
  async titleOf(sessionId: string): Promise<string | undefined> {
    if (this.#dependencies.folder === undefined) return undefined;
    if (this.#names === undefined) {
      this.#names = this.#walk(this.#dependencies.folder).finally(() => {
        this.#names = undefined;
      });
    }
    return (await this.#names).get(sessionId);
  }

  /**
   * Every session file at exactly `DESKTOP_SESSIONS.depth` levels under the folder - one that sits shallower or deeper
   * is not the measured shape and is not read. Two files naming one id with different titles name none (CD2): the
   * contract has no way to pick, and a guess would show a person the wrong conversation's name.
   */
  async #walk(folder: string): Promise<ReadonlyMap<string, string>> {
    const names = new Map<string, string>();
    const conflicted = new Set<string>();
    for (const first of await this.#list(folder)) {
      if (first.kind !== 'directory') continue;
      for (const second of await this.#list(join(folder, first.name))) {
        if (second.kind !== 'directory') continue;
        for (const entry of await this.#list(join(folder, first.name, second.name))) {
          if (entry.kind !== 'file' || !isDesktopSessionFileName(entry.name)) continue;
          const file = await this.#file(join(folder, first.name, second.name, entry.name));
          if (file?.id === undefined || file.title === undefined) continue;
          const known = names.get(file.id);
          if (known !== undefined && known !== file.title) {
            conflicted.add(file.id);
            continue;
          }
          names.set(file.id, file.title);
        }
      }
    }
    for (const id of conflicted) names.delete(id);
    return names;
  }

  async #list(path: string): Promise<readonly DirectoryEntry[]> {
    try {
      return await this.#dependencies.directories.list(path);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return [];
    }
  }

  /** One file's two fields, from the cache where it has not changed. A shape that is not CDB1's says nothing. */
  async #file(path: string): Promise<ReadFile | undefined> {
    const { directories, files } = this.#dependencies;
    try {
      const modifiedAt = await directories.modifiedAt(path);
      const kept = this.#read.get(path);
      if (kept !== undefined && kept.modifiedAt === modifiedAt) return kept;
      const record = parseJsonObject(await files.readText(path));
      const id = record?.[DESKTOP_SESSIONS.sessionIdField];
      const rawTitle = record?.[DESKTOP_SESSIONS.titleField];
      const title = typeof rawTitle === 'string' ? oneLine(rawTitle) : '';
      const read: ReadFile = { modifiedAt, ...(typeof id === 'string' && id !== '' && title !== '' ? { id, title } : {}) };
      this.#read.set(path, read);
      return read;
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return undefined;
    }
  }
}
