// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { ProjectCatalogue } from './project-catalogue.ts';
import { sessionKey, type SessionCatalogue, type SessionSummary } from './session-catalogue.ts';

/** Every project's conversations on this computer, each with the project it was held in. */
export interface EveryProjectListing {
  /** Newest first; every one carries its `project`. */
  readonly sessions: readonly SessionSummary[];
  /**
   * Projects whose folder none of their conversations said, as the project catalogue counts them: their conversations
   * are not listed, since the rules they would be read under are a folder's (GD17), and no folder is guessed.
   */
  readonly unreadable: number;
}

/** Lists every project's conversations at once (`.ai/specs/2026-10-05-protected-everywhere.md` G11). */
export interface EveryProjectSessions {
  list(): Promise<EveryProjectListing>;
}

/**
 * Every project's conversations (G11): each project the projects window lists (`which-project.md` V9), listed by the
 * one-folder catalogue, merged and sorted - `CombinedSessionCatalogue` one level up. A session carries its project's
 * folder, since it is read under that project's rules (GD17), and whether that folder may be looked into (V10b);
 * listing reads the AIs' own stores and never a project's folder.
 *
 * A file two projects list - one folder's conversations kept under two ids - is one row. Two files one key names stay two
 * rows: the older is given the key with a number after it, so neither overwrites the other's report.
 */
export class EveryProjectCatalogue implements EveryProjectSessions {
  readonly #projects: ProjectCatalogue;
  readonly #catalogue: SessionCatalogue;

  constructor(projects: ProjectCatalogue, catalogue: SessionCatalogue) {
    this.#projects = projects;
    this.#catalogue = catalogue;
  }

  async list(): Promise<EveryProjectListing> {
    const listing = await this.#projects.list();
    const each = await Promise.all(listing.projects.map(async (project) => {
      const project_ = { folder: project.path, looked: project.folder !== 'not-looked' };
      return (await this.#catalogue.list(project.path)).sessions.map((session): SessionSummary => ({ ...session, project: project_ }));
    }));
    const paths = new Set<string>();
    const keys = new Map<string, number>();
    const sessions: SessionSummary[] = [];
    for (const session of each.flat().sort((a, b) => b.modifiedAt - a.modifiedAt)) {
      if (paths.has(session.path)) continue;
      paths.add(session.path);
      const key = sessionKey(session);
      const seen = keys.get(key) ?? 0;
      keys.set(key, seen + 1);
      sessions.push(seen === 0 ? session : { ...session, key: `${key}-${seen + 1}` });
    }
    return { sessions, unreadable: listing.unreadable };
  }
}
