// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Recognition } from '../../../core/session-format.ts';
import type { SessionSummary } from '../../../core/session-catalogue.ts';
import type { SessionModel } from '../../../core/session-model.ts';
import type { SessionSource } from '../../../core/session-source.ts';
import type { SessionRecognition, SessionTitles } from '../../../core/session-titles.ts';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { readChatLogHeader } from './chat-log-header.ts';

/**
 * Whether an input is a VS Code chat log (VCD1): a file whose first line is a chat's snapshot. A folder is none - a
 * workspace's folders hold other files, and a chat is reported on by its log.
 */
export async function recogniseVsCodeChat(directories: DirectoryReader, files: FileReader, input: string): Promise<Recognition> {
  try {
    if ((await directories.kindOf(input)) === 'directory') return 'unknown';
  } catch (error) {
    if (error instanceof FileAccessError) return 'unavailable';
    throw error;
  }
  const read = await readChatLogHeader(files, input);
  return read.kind === 'recognised' ? 'recognised' : read.kind === 'unavailable' ? 'unavailable' : 'unknown';
}

type Recognise = (input: string) => Promise<Recognition>;

/**
 * VCD1: one AI, two records - the runtime's, which the desktop app and the CLI write, and the log VS Code keeps - both
 * Copilot's. The runtime's first-line rule is asked first, then VS Code's; an input either could not read to tell is
 * unavailable only where neither recognised it.
 */
export function recogniseCopilotRecord(runtime: Recognise, vsCode: Recognise): Recognise {
  return async (input) => {
    const first = await runtime(input);
    if (first === 'recognised') return first;
    const second = await vsCode(input);
    if (second === 'recognised') return second;
    return first === 'unavailable' || second === 'unavailable' ? 'unavailable' : 'unknown';
  };
}

export interface CopilotSourceRouterDependencies {
  readonly runtime: SessionSource;
  readonly vsCode: SessionSource;
  readonly isVsCodeChat: Recognise;
}

/** Reads a Copilot input with the source of its record (VCD1): VS Code's chat log by its reader, anything else the runtime's. */
export class CopilotSourceRouter implements SessionSource {
  readonly #runtime: SessionSource;
  readonly #vsCode: SessionSource;
  readonly #isVsCodeChat: Recognise;

  constructor(dependencies: CopilotSourceRouterDependencies) {
    this.#runtime = dependencies.runtime;
    this.#vsCode = dependencies.vsCode;
    this.#isVsCodeChat = dependencies.isVsCodeChat;
  }

  async read(input: string): Promise<SessionModel> {
    return (await this.#isVsCodeChat(input)) === 'recognised' ? this.#vsCode.read(input) : this.#runtime.read(input);
  }
}

export interface CopilotTitlesRouterDependencies {
  readonly runtime: SessionTitles;
  readonly vsCode: SessionTitles;
  readonly isVsCodeChat: Recognise;
}

/** What a person recognises a Copilot conversation by, read from its own record (VCD1): a chat log's by VS Code's titles. */
export class CopilotTitlesRouter implements SessionTitles {
  readonly #dependencies: CopilotTitlesRouterDependencies;

  constructor(dependencies: CopilotTitlesRouterDependencies) {
    this.#dependencies = dependencies;
  }

  async recognise(session: SessionSummary): Promise<SessionRecognition> {
    const { runtime, vsCode, isVsCodeChat } = this.#dependencies;
    return (await isVsCodeChat(session.path)) === 'recognised' ? vsCode.recognise(session) : runtime.recognise(session);
  }
}
