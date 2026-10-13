// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import { textOrUndefined, type FileReader } from '../../../ports/file-reader.ts';
import { isJsonObject, parseJsonObject, type JsonObject } from '../../../shared/json.ts';
import { CALL, CHAT, REQUEST, VS_CODE_LOG_TOOLS, VS_CODE_STORE } from '../contract/vs-code.ts';
import { chatLogHeaderOf } from '../chat-log/chat-log-header.ts';
import { ChatLogReplay } from '../chat-log/chat-log-replay.ts';

/** One Copilot chat VS Code keeps, as a list sees it. Its title crosses redaction before any page holds it. */
export interface VsCodeChat {
  /** Its `sessionId`, which its log's name is (VCB-M19, 95 of 95). */
  readonly id: string;
  /** Its log: what a reader is given. */
  readonly log: string;
  /** When the log last changed: for ordering a list, never for a join. */
  readonly modifiedAt: number;
  /** `customTitle` (VCB-M4): every chat with a request has one. */
  readonly title?: string;
  /** Its last request's time, ms (VCB-M5, VCB-M19). */
  readonly lastActive?: number;
  /** The `runSubagent` calls it made (VCB-M16). */
  readonly helpers: number;
}

/** A log read for a list: a chat, a chat with no request - opened and left, no conversation - or one no row can read. */
export type ChatLogRead = { readonly kind: 'chat'; readonly chat: VsCodeChat } | { readonly kind: 'empty' } | { readonly kind: 'unread' };

export interface VsCodeChatListing {
  /** VS Code's `workspaceStorage` (VCB-M1). */
  readonly root: string;
  /** Whether it was there to list, on the one platform measured: not there is "not looked at", never "no chats". */
  readonly found: boolean;
  /** Newest first. */
  readonly chats: readonly VsCodeChat[];
  /**
   * Logs of the folder's workspaces no row reads (VC6, VCD4): a first line that is no chat's, a log naming another chat
   * than its file, a log the replay could not open. Counted, never named.
   */
  readonly unread: number;
}

/** Every folder VS Code keeps Copilot chats for, each with its chats (`which-project.md` V9). */
export interface VsCodeFolders {
  readonly found: boolean;
  /** By folder; a folder with no chat a row reads is not listed. */
  readonly folders: ReadonlyMap<string, readonly VsCodeChat[]>;
  /**
   * Workspaces with a chat whose `workspace.json` names no folder on this computer - a multi-root workspace (VCB4), a
   * remote one: counted, never guessed.
   */
  readonly unlisted: number;
}

export interface VsCodeChatDiscoveryDependencies {
  readonly directories: DirectoryReader;
  readonly files: FileReader;
  readonly home: string;
  readonly platform: string;
}

/** Logs read at once: each holds a descriptor until it is read through. */
const AT_ONCE = 8;

/**
 * Finds the Copilot chats VS Code keeps for a folder (`what-vs-code-copilot-wrote` VC5, plan step 4): the logs in
 * `chatSessions` of every workspace whose `workspace.json` names exactly that folder (VCB-M1, CPB1). A log is replayed
 * whole for its title, its time and its helpers - VS Code sets them by later lines, and a log is small (largest measured
 * 212 KB). macOS alone (VCD5, VCB3); a multi-root workspace names no folder and is not looked at (VCB4).
 */
export class VsCodeChatDiscovery {
  readonly #dependencies: VsCodeChatDiscoveryDependencies;

  constructor(dependencies: VsCodeChatDiscoveryDependencies) {
    this.#dependencies = dependencies;
  }

  get root(): string {
    return join(this.#dependencies.home, ...VS_CODE_STORE.workspaces);
  }

  async list(folder: string): Promise<VsCodeChatListing> {
    const root = this.root;
    const store = await this.#workspaces();
    if (store === undefined) return { root, found: false, chats: [], unread: 0 };
    const { chats, unread } = await this.#chatsOf(store.filter((workspace) => workspace.folder === folder).flatMap((workspace) => workspace.logs));
    return { root, found: true, chats, unread };
  }

  /** Every folder VS Code keeps Copilot chats for (V9): what the projects window and the computer's page list. */
  async everyFolder(): Promise<VsCodeFolders> {
    const store = await this.#workspaces();
    if (store === undefined) return { found: false, folders: new Map(), unlisted: 0 };
    const logsOf = new Map<string, string[]>();
    let unlisted = 0;
    for (const workspace of store) {
      if (workspace.folder !== undefined) logsOf.set(workspace.folder, [...(logsOf.get(workspace.folder) ?? []), ...workspace.logs]);
      else if ((await this.#chatsOf(workspace.logs)).chats.length > 0) unlisted += 1;
    }
    const folders = new Map<string, readonly VsCodeChat[]>();
    for (const [folder, logs] of logsOf) {
      const { chats } = await this.#chatsOf(logs);
      if (chats.length > 0) folders.set(folder, chats);
    }
    return { found: true, folders, unlisted };
  }

  /**
   * Each workspace of VS Code's store, with the folder its `workspace.json` names - none for a multi-root or remote one -
   * and its chat logs; `undefined` on a platform not measured, or where the store is not there.
   */
  async #workspaces(): Promise<readonly { readonly folder?: string; readonly logs: readonly string[] }[] | undefined> {
    const { directories, files, platform } = this.#dependencies;
    if (platform !== 'darwin') return undefined;
    let workspaces;
    try {
      workspaces = await directories.list(this.root);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return undefined;
    }
    const found = [];
    for (const workspace of workspaces) {
      if (workspace.kind !== 'directory') continue;
      const at = join(this.root, workspace.name);
      const named = parseJsonObject((await textOrUndefined(files, join(at, VS_CODE_STORE.workspaceFile)).catch(() => undefined)) ?? '')?.[VS_CODE_STORE.folderKey];
      const folder = typeof named === 'string' ? pathOf(named) : undefined;
      const entries = await directories.list(join(at, VS_CODE_STORE.chatLogs)).catch(() => []);
      const logs = entries.filter((entry) => entry.kind === 'file' && entry.name.endsWith(VS_CODE_STORE.extension)).map((entry) => join(at, VS_CODE_STORE.chatLogs, entry.name));
      found.push({ ...(folder === undefined ? {} : { folder }), logs });
    }
    return found;
  }

  async #chatsOf(logs: readonly string[]): Promise<{ readonly chats: VsCodeChat[]; readonly unread: number }> {
    const chats: VsCodeChat[] = [];
    let unread = 0;
    for (let from = 0; from < logs.length; from += AT_ONCE) {
      for (const read of await Promise.all(logs.slice(from, from + AT_ONCE).map((log) => this.read(log)))) {
        if (read.kind === 'chat') chats.push(read.chat);
        else if (read.kind === 'unread') unread += 1;
      }
    }
    return { chats: chats.sort((a, b) => b.modifiedAt - a.modifiedAt), unread };
  }

  /** One log, as `list` reads each: what a row and its title are read from. */
  async read(log: string): Promise<ChatLogRead> {
    const { directories, files } = this.#dependencies;
    const replay = new ChatLogReplay();
    let first = true;
    let modifiedAt;
    try {
      for await (const line of files.readLines(log)) {
        if (first && chatLogHeaderOf(line) === undefined) return { kind: 'unread' };
        first = false;
        replay.line(line);
      }
      modifiedAt = await directories.modifiedAt(log);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return { kind: 'unread' };
    }
    const chat = replay.result().chat;
    if (first || chat === undefined || chat[CHAT.sessionId] !== basename(log, VS_CODE_STORE.extension)) return { kind: 'unread' };
    const requests = (Array.isArray(chat[CHAT.requests]) ? chat[CHAT.requests] as unknown[] : []).filter(isJsonObject);
    // VC5: a chat with no request was opened and left - no conversation, and nothing missing from the list.
    if (requests.length === 0) return { kind: 'empty' };
    const title = chat[CHAT.title];
    const when = requests[requests.length - 1]?.[REQUEST.timestamp];
    return {
      kind: 'chat',
      chat: {
        id: chat[CHAT.sessionId] as string,
        log,
        modifiedAt,
        ...(typeof title === 'string' && title !== '' ? { title } : {}),
        ...(typeof when === 'number' && Number.isFinite(when) ? { lastActive: when } : {}),
        helpers: requests.reduce((n, request) => n + helpersOf(request), 0),
      },
    };
  }
}

/** The `runSubagent` calls of one request's rounds (VCB-M6, VCB-M16). */
function helpersOf(request: JsonObject): number {
  const result = request[REQUEST.result];
  const metadata = isJsonObject(result) ? result[REQUEST.metadata] : undefined;
  const rounds = isJsonObject(metadata) ? metadata[REQUEST.rounds] : undefined;
  return (Array.isArray(rounds) ? rounds : []).reduce((n: number, round) => {
    const calls = isJsonObject(round) ? round[REQUEST.calls] : undefined;
    return n + (Array.isArray(calls) ? calls : []).filter((call) => isJsonObject(call) && call[CALL.name] === VS_CODE_LOG_TOOLS.subagent.name).length;
  }, 0);
}

/** The folder a `file://` address names, or `undefined` for any other: `workspace.json`'s `folder` (CPB1). */
export function pathOf(address: string): string | undefined {
  if (!address.startsWith('file://')) return undefined;
  try {
    return fileURLToPath(address).replace(/\/+$/, '');
  } catch {
    return undefined;
  }
}
