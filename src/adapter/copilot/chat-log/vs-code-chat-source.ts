// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { basename, dirname, join } from 'node:path';
import { correlate } from '../../../core/correlation/correlate.ts';
import type { SessionModel } from '../../../core/session-model.ts';
import type { SessionSource } from '../../../core/session-source.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import { textOrUndefined, type FileReader } from '../../../ports/file-reader.ts';
import { parseJsonObject } from '../../../shared/json.ts';
import { VS_CODE_STORE } from '../contract/vs-code.ts';
import { pathOf } from '../discovery/vs-code-chats.ts';
import { ChatLogReplay } from './chat-log-replay.ts';
import { chatRecords } from './chat-scan.ts';

export interface VsCodeChatSourceDependencies {
  readonly files: FileReader;
}

/**
 * Reads a Copilot chat held in VS Code - the log VS Code keeps of it, `workspaceStorage/<hash>/chatSessions/<id>.jsonl` -
 * into the core's model (`what-vs-code-copilot-wrote` VC1, plan step 2). Its project is the folder the workspace's
 * `workspace.json` names, where there is one beside the log's folder. Copilot's own transcript of the chat is not read
 * (VCB-M10).
 */
export class VsCodeChatSource implements SessionSource {
  readonly #files: FileReader;

  constructor(dependencies: VsCodeChatSourceDependencies) {
    this.#files = dependencies.files;
  }

  async read(input: string): Promise<SessionModel> {
    const fallbackId = basename(input, VS_CODE_STORE.extension);
    const replay = new ChatLogReplay();
    let lines = 0;
    let cut = false;
    try {
      for await (const line of this.#files.readLines(input)) {
        lines += 1;
        replay.line(line);
      }
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      // The lines read before it stopped stand; what came after is a part of the chat no one read.
      cut = true;
    }
    const replayed = replay.result();
    if (lines === 0 || (replayed.chat === undefined && replayed.damaged === 0)) return missing(fallbackId);
    const workspaceFolder = await this.#workspaceFolder(input);
    const records = chatRecords(replayed, { fallbackId, ...(workspaceFolder === undefined ? {} : { workspaceFolder }) });
    return correlate(cut ? { ...records, gaps: [...records.gaps, { kind: 'source-missing' }] } : records);
  }

  /**
   * The folder `workspace.json` names, beside the `chatSessions` folder the log is in (VCB-M1, CPB1); none for a log kept
   * anywhere else, or where it names none.
   */
  async #workspaceFolder(log: string): Promise<string | undefined> {
    if (basename(dirname(log)) !== VS_CODE_STORE.chatLogs) return undefined;
    const text = await textOrUndefined(this.#files, join(dirname(dirname(log)), VS_CODE_STORE.workspaceFile)).catch(() => undefined);
    const folder = parseJsonObject(text ?? '')?.[VS_CODE_STORE.folderKey];
    return typeof folder === 'string' ? pathOf(folder) : undefined;
  }
}

/** Not a chat log, or not readable: there is no chat to report on, and saying so is the whole answer. */
function missing(sessionId: string): SessionModel {
  return correlate({
    sessionId, provider: 'copilot', agents: [], calls: [], results: [], delegations: [], delegationIndex: [], followUps: [],
    followUpIndex: [], messages: [], deliveredReports: [], agentReports: [], workingDirectories: [], turns: [], reviews: [],
    contexts: [], deliveries: [], capabilities: [], gaps: [{ kind: 'session-missing' }],
  });
}
