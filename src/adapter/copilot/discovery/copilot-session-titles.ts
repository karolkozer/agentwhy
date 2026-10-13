// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { dirname, join } from 'node:path';
import type { Redactor } from '../../../core/redaction/redactor.ts';
import type { SessionSummary } from '../../../core/session-catalogue.ts';
import type { SessionRecognition, SessionTitles } from '../../../core/session-titles.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import { textOrUndefined, type FileReader } from '../../../ports/file-reader.ts';
import type { FileTailReader } from '../../../ports/file-tail-reader.ts';
import { parseJsonObject } from '../../../shared/json.ts';
import { oneLine } from '../../../shared/printable.ts';
import { ENVELOPE } from '../contract/envelope.ts';
import { WORKSPACE_FILE } from '../contract/session.ts';
import { entryPointOf } from './held-in.ts';
import { parseWorkspace } from './workspace-file.ts';

export interface CopilotSessionTitlesDependencies {
  readonly files: FileReader;
  readonly tails: FileTailReader;
  /** Only the free-text door: a title is whatever the app wrote from what the person typed. */
  readonly redactor: Pick<Redactor, 'scan'>;
}

/** How much of a session's end is read for its last time: every line carries one (§2.8), and a line is rarely this long. */
const TAIL_BYTES = 256 * 1024;

/**
 * What a person recognises a Copilot conversation by (`which-project.md` V4, `what-copilot-wrote` CPB35): the title the
 * apps show, `workspace.yaml`'s `name`, past the redactor; where it was held, from its `client_name`; and when it was
 * last active - its last record's time (`when-it-was-last-active` LA1), never `workspace.yaml`'s `updated_at` (LA5).
 */
export class CopilotSessionTitles implements SessionTitles {
  readonly #dependencies: CopilotSessionTitlesDependencies;

  constructor(dependencies: CopilotSessionTitlesDependencies) {
    this.#dependencies = dependencies;
  }

  async recognise(session: SessionSummary): Promise<SessionRecognition> {
    const text = await textOrUndefined(this.#dependencies.files, join(dirname(session.path), WORKSPACE_FILE));
    const workspace = text === undefined ? {} : parseWorkspace(text);
    const entryPoint = entryPointOf(workspace.client);
    // Scan the whole title before it is made one line: a value cut in two might no longer be recognised.
    const title = workspace.title === undefined ? '' : oneLine(this.#dependencies.redactor.scan(workspace.title));
    const lastActive = await this.#lastActive(session.path);
    return {
      ...(title === '' ? {} : { title: this.#dependencies.redactor.scan(title) }),
      ...(entryPoint === undefined ? {} : { entryPoint }),
      ...(lastActive === undefined ? {} : { lastActive }),
    };
  }

  /** LA1: the time of the last whole record of the file's end. A line cut by the tail, or still being written, is none. */
  async #lastActive(path: string): Promise<number | undefined> {
    let tail;
    try {
      tail = await this.#dependencies.tails.readTail(path, TAIL_BYTES);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return undefined;
    }
    const lines = tail.split('\n');
    for (let at = lines.length - 1; at >= 0; at -= 1) {
      const stamp = parseJsonObject(lines[at] ?? '')?.[ENVELOPE.recordedAt];
      const time = typeof stamp === 'string' ? Date.parse(stamp) : Number.NaN;
      if (Number.isFinite(time)) return time;
    }
    return undefined;
  }
}
