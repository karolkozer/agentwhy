// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { basename, join } from 'node:path';
import type { EntryPoint } from '../../../core/entry-point.ts';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import { textOrUndefined, type FileReader } from '../../../ports/file-reader.ts';
import { parseJsonObject } from '../../../shared/json.ts';
import { ENVELOPE, RECORD_TYPES } from '../contract/envelope.ts';
import { EVENTS_FILE, WORKSPACE_FILE } from '../contract/session.ts';
import { entryPointOf } from './held-in.ts';
import { readHeader } from './session-header.ts';
import { parseWorkspace } from './workspace-file.ts';

/** One Copilot conversation, before anything past its first message is read. Paths and titles cross redaction later. */
export interface CopilotSession {
  /** Its folder's name, which its first line's `sessionId` equals (spec §2.8). */
  readonly id: string;
  readonly folder: string;
  /** Its `events.jsonl`: what a reader is given. */
  readonly events: string;
  /** When `events.jsonl` last changed: for ordering a list, never for a join. */
  readonly modifiedAt: number;
  /** The folder it ran in, where `workspace.yaml` and the first line agree, or only one of them says (CP3a). */
  readonly project?: string;
  readonly title?: string;
  readonly entryPoint?: EntryPoint;
  readonly forkCount: number;
  readonly version?: string;
}

/**
 * Why a folder under the root is no conversation (CP29, CP1a): no `events.jsonl`; a first line that is not the runtime's;
 * no message from a person; a first line naming another session than its folder; a file the port could not read.
 */
export type SkipReason = 'no-events' | 'not-copilot' | 'no-message' | 'identity-mismatch' | 'unreadable';

export type FolderRead = { readonly kind: 'session'; readonly session: CopilotSession } | { readonly kind: 'skipped'; readonly reason: SkipReason };

export interface CopilotListing {
  readonly root: string;
  /** Whether the root itself was there to list: not there is "not looked at", never "no conversations". */
  readonly found: boolean;
  /** Newest first. */
  readonly sessions: readonly CopilotSession[];
  /** Folders that are no conversation, counted by why and never named. */
  readonly skipped: Readonly<Record<SkipReason, number>>;
  /** Sessions whose first line and `workspace.yaml` name different folders: listed with no project, never a guess. */
  readonly projectConflicts: number;
}

export interface CopilotSessionDiscoveryDependencies {
  readonly directories: DirectoryReader;
  readonly files: FileReader;
}

/** Folders read at once: each holds a descriptor and up to its first message until it answers. */
const AT_ONCE = 8;

/**
 * Finds Copilot's conversations under `~/.copilot/session-state` (spec §2.8, CP2): one folder each, named by its id. Reads
 * a folder's `workspace.yaml` and its `events.jsonl` up to the first message a person sent, and nothing further. A folder
 * whose name starts with a dot is the runtime's own and is not looked at.
 */
export class CopilotSessionDiscovery {
  readonly #dependencies: CopilotSessionDiscoveryDependencies;

  constructor(dependencies: CopilotSessionDiscoveryDependencies) {
    this.#dependencies = dependencies;
  }

  async list(root: string): Promise<CopilotListing> {
    const skipped: Record<SkipReason, number> = { 'no-events': 0, 'not-copilot': 0, 'no-message': 0, 'identity-mismatch': 0, unreadable: 0 };
    let entries;
    try {
      entries = await this.#dependencies.directories.list(root);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return { root, found: false, sessions: [], skipped, projectConflicts: 0 };
    }
    const folders = entries.filter((entry) => entry.kind === 'directory' && !entry.name.startsWith('.')).map((entry) => join(root, entry.name));
    const sessions: CopilotSession[] = [];
    let projectConflicts = 0;
    for (let from = 0; from < folders.length; from += AT_ONCE) {
      const reads = await Promise.all(folders.slice(from, from + AT_ONCE).map((folder) => this.#read(folder)));
      for (const read of reads) {
        if (read.kind === 'skipped') skipped[read.reason] += 1;
        else {
          sessions.push(read.session);
          if (read.conflict) projectConflicts += 1;
        }
      }
    }
    return { root, found: true, sessions: sessions.sort((a, b) => b.modifiedAt - a.modifiedAt), skipped, projectConflicts };
  }

  /** One folder, as `list` reads each: what `report --input <folder>` is given. */
  async read(folder: string): Promise<FolderRead> {
    const read = await this.#read(folder);
    return read.kind === 'session' ? { kind: 'session', session: read.session } : read;
  }

  async #read(folder: string): Promise<{ readonly kind: 'session'; readonly session: CopilotSession; readonly conflict: boolean } | { readonly kind: 'skipped'; readonly reason: SkipReason }> {
    const { directories, files } = this.#dependencies;
    const events = join(folder, EVENTS_FILE);
    const id = basename(folder);
    const header = await readHeader(files, events);
    if (header.kind === 'unavailable') return { kind: 'skipped', reason: header.failure === 'not-found' ? 'no-events' : 'unreadable' };
    if (header.kind === 'unknown') return { kind: 'skipped', reason: 'not-copilot' };
    if (header.header.sessionId !== id) return { kind: 'skipped', reason: 'identity-mismatch' };
    let modifiedAt;
    let asked;
    try {
      asked = await this.#holdsMessage(events);
      modifiedAt = await directories.modifiedAt(events);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return { kind: 'skipped', reason: 'unreadable' };
    }
    if (!asked) return { kind: 'skipped', reason: 'no-message' };
    const workspaceText = await textOrUndefined(files, join(folder, WORKSPACE_FILE));
    const workspace = workspaceText === undefined ? {} : parseWorkspace(workspaceText);
    const conflict = workspace.project !== undefined && header.header.project !== undefined && workspace.project !== header.header.project;
    const project = conflict ? undefined : (workspace.project ?? header.header.project);
    const entryPoint = entryPointOf(workspace.client);
    return {
      kind: 'session',
      conflict,
      session: {
        id,
        folder,
        events,
        modifiedAt,
        ...(project === undefined ? {} : { project }),
        ...(workspace.title === undefined ? {} : { title: workspace.title }),
        ...(entryPoint === undefined ? {} : { entryPoint }),
        forkCount: workspace.forkCount ?? 0,
        ...(header.header.version === undefined ? {} : { version: header.header.version }),
      },
    };
  }

  /** Whether a person sent a message (CP29): the file is read up to the first `user.message`, and closed. */
  async #holdsMessage(events: string): Promise<boolean> {
    for await (const line of this.#dependencies.files.readLines(events)) {
      if (parseJsonObject(line)?.[ENVELOPE.type] === RECORD_TYPES.userMessage) return true;
    }
    return false;
  }
}
