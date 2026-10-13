// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { basename, dirname, join } from 'node:path';
import { correlate } from '../../../core/correlation/correlate.ts';
import type { SessionModel } from '../../../core/session-model.ts';
import type { SessionSource } from '../../../core/session-source.ts';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { EVENTS_FILE } from '../contract/session.ts';
import { readHeader } from '../discovery/session-header.ts';
import { EventsScan } from './events-scan.ts';
import { forkCountOf, forkParentLines } from './shared-lines.ts';

export interface CopilotSessionSourceDependencies {
  readonly directories: DirectoryReader;
  readonly files: FileReader;
}

/**
 * Reads a Copilot conversation - the desktop app's or the CLI's, from `~/.copilot/session-state/<id>` - into the core's
 * model (`2026-10-05-what-copilot-wrote.md`, plan step 4). Given the session's folder or its `events.jsonl`. One file holds
 * every agent of the conversation, so it is read once, by `EventsScan`, and joined by `correlate`. A fork's lines copied
 * from its parent are the parent's (CP26).
 */
export class CopilotSessionSource implements SessionSource {
  readonly #directories: DirectoryReader;
  readonly #files: FileReader;

  constructor(dependencies: CopilotSessionSourceDependencies) {
    this.#directories = dependencies.directories;
    this.#files = dependencies.files;
  }

  async read(input: string): Promise<SessionModel> {
    const { folder, events } = await this.#placeOf(input);
    const header = await readHeader(this.#files, events);
    if (header.kind !== 'recognised') return missing(basename(folder));

    const { sessionId, version, project } = header.header;
    const scan = new EventsScan({
      sessionId,
      ...(version === undefined ? {} : { version }),
      ...(project === undefined ? {} : { workingDirectory: project }),
      parentLines: await forkParentLines(this.#directories, this.#files, folder),
      countsForks: (await forkCountOf(this.#files, folder)) > 0,
    });
    try {
      for await (const line of this.#files.readLines(events)) scan.line(line);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      // The lines read before it stopped stand; what came after is a part of the session no one read.
      const records = scan.records();
      return correlate({ ...records, gaps: [...records.gaps, { kind: 'source-missing' }] });
    }
    return correlate(scan.records());
  }

  /** A session is its folder (CP2): given the folder, its events file is inside; given the file, its folder holds it. */
  async #placeOf(input: string): Promise<{ readonly folder: string; readonly events: string }> {
    try {
      if ((await this.#directories.kindOf(input)) === 'directory') return { folder: input, events: join(input, EVENTS_FILE) };
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
    }
    return { folder: dirname(input), events: input };
  }
}

/** Not a Copilot session, or not readable: there is no session to report on, and saying so is the whole answer. */
function missing(sessionId: string): SessionModel {
  return correlate({
    sessionId, provider: 'copilot', agents: [], calls: [], results: [], delegations: [], delegationIndex: [], followUps: [],
    followUpIndex: [], messages: [], deliveredReports: [], agentReports: [], workingDirectories: [], turns: [], reviews: [],
    contexts: [], deliveries: [], capabilities: [], gaps: [{ kind: 'session-missing' }],
  });
}
