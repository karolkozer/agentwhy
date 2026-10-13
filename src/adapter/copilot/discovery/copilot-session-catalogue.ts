// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { SessionCatalogue, SessionListing, SessionSummary } from '../../../core/session-catalogue.ts';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import type { CopilotSession } from './copilot-session-discovery.ts';
import type { CopilotSessionIndex } from './copilot-session-index.ts';
import { helpersStarted } from './helpers-started.ts';

export interface CopilotSessionCatalogueDependencies {
  readonly index: CopilotSessionIndex;
  readonly directories: DirectoryReader;
  readonly files: FileReader;
  /** `~/.copilot/session-state` (`SESSIONS_ROOT`); other systems are not measured (CPO5). */
  readonly sessionsRoot: string;
}

/** Sessions whose helpers are counted at once: each holds a descriptor until it is read through. */
const AT_ONCE = 8;

/**
 * A project's Copilot conversations, the desktop app's and the CLI's (`what-copilot-wrote` CP2, CP3a): each session whose
 * folder is the project's own, exactly - Copilot records the folder itself, as Codex does. A session is listed by its
 * `events.jsonl`, what `report --input` is given.
 */
export class CopilotSessionCatalogue implements SessionCatalogue {
  readonly #dependencies: CopilotSessionCatalogueDependencies;

  constructor(dependencies: CopilotSessionCatalogueDependencies) {
    this.#dependencies = dependencies;
  }

  async list(workingDirectory: string): Promise<SessionListing> {
    const { index, directories, files, sessionsRoot } = this.#dependencies;
    const listing = await index.list(sessionsRoot);
    const mine = listing.sessions.filter((session) => session.project === workingDirectory);
    const sessions: SessionSummary[] = [];
    for (let from = 0; from < mine.length; from += AT_ONCE) {
      sessions.push(...await Promise.all(mine.slice(from, from + AT_ONCE).map(async (session: CopilotSession): Promise<SessionSummary> => ({
        id: session.id,
        path: session.events,
        modifiedAt: session.modifiedAt,
        delegations: await helpersStarted(directories, files, session.events),
        provider: 'copilot',
      }))));
    }
    // The place searched is Copilot's whole store, so not finding it is the store missing (R28, amended 2026-10-01).
    const found = listing.found;
    return {
      directory: sessionsRoot, found,
      searched: [{ provider: 'copilot', directory: sessionsRoot, found, ...(found ? {} : { store: 'missing' as const }) }],
      sessions: sessions.sort((a, b) => b.modifiedAt - a.modifiedAt),
    };
  }
}
