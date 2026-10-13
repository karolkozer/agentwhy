// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { SessionCatalogue, SessionListing } from '../../../core/session-catalogue.ts';
import type { VsCodeChatDiscovery } from './vs-code-chats.ts';

/**
 * A project's Copilot chats held in VS Code (`what-vs-code-copilot-wrote` VC5, VCD1, plan step 4): Copilot's rows beside
 * the desktop app's and the CLI's, each listed by its log - what `report --input` is given - under the key
 * `copilot-<session id>`. VS Code's store is named among the places looked in only where it is there: a person who does
 * not use VS Code is told nothing of it.
 */
export class VsCodeChatCatalogue implements SessionCatalogue {
  readonly #discovery: VsCodeChatDiscovery;

  constructor(discovery: VsCodeChatDiscovery) {
    this.#discovery = discovery;
  }

  async list(workingDirectory: string): Promise<SessionListing> {
    const listing = await this.#discovery.list(workingDirectory);
    return {
      directory: listing.root,
      found: listing.found,
      searched: listing.found ? [{ provider: 'copilot', directory: listing.root, found: true }] : [],
      sessions: listing.chats.map((chat) => ({ id: chat.id, path: chat.log, modifiedAt: chat.modifiedAt, delegations: chat.helpers, provider: 'copilot' })),
    };
  }
}
