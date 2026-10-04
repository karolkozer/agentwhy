// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { SessionCatalogue, SessionListing } from './session-catalogue.ts';

/**
 * One list of a project's conversations, whichever AI held them (`2026-09-27-what-codex-wrote.md` XD5, X28): every
 * catalogue is asked, every session kept with its provider - two AIs may use one id - and every place looked in is kept
 * with whether it was there. The listing was `found` where any place was: a project only one AI worked in is still a
 * project with conversations. Found by looking at a Codex-only project, which said it had none.
 */
export class CombinedSessionCatalogue implements SessionCatalogue {
  readonly #catalogues: readonly SessionCatalogue[];

  constructor(catalogues: readonly SessionCatalogue[]) {
    if (catalogues.length === 0) throw new Error('A combined catalogue needs a catalogue to combine.');
    this.#catalogues = catalogues;
  }

  async list(workingDirectory: string): Promise<SessionListing> {
    const listings = await Promise.all(this.#catalogues.map((catalogue) => catalogue.list(workingDirectory)));
    const [first] = listings as [SessionListing, ...SessionListing[]];
    const found = listings.find((listing) => listing.found) ?? first;
    return {
      directory: found.directory,
      found: found.found,
      searched: listings.flatMap((listing) => listing.searched),
      sessions: listings.flatMap((listing) => listing.sessions).sort((a, b) => b.modifiedAt - a.modifiedAt),
    };
  }
}
