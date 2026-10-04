// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { CodexListing, CodexSessionDiscovery, KnownListing } from './codex-session-discovery.ts';

/**
 * The last listing of the sessions root, taken by a catalogue and reused by the reader for the conversations it listed
 * (the review of 2026-09-29, `.ai/plans/2026-09-29-what-codex-wrote.md`): the root's headers are read once per listing,
 * not once per conversation. It is only ever the latest - every listing replaces it - so a thread started since is in
 * the next one, and nothing is kept past it.
 */
export class CodexSessionIndex {
  readonly #discovery: CodexSessionDiscovery;
  #latest: KnownListing | undefined;

  constructor(discovery: CodexSessionDiscovery) {
    this.#discovery = discovery;
  }

  async list(directory: string): Promise<CodexListing> {
    const listing = await this.#discovery.list(directory);
    this.#latest = { directory, listing };
    return listing;
  }

  latest(): KnownListing | undefined {
    return this.#latest;
  }
}
