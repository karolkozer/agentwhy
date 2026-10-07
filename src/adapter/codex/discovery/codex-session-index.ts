// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { CodexListing, CodexSessionDiscovery, KnownListing } from './codex-session-discovery.ts';

/**
 * The last listing of the sessions root, taken by a catalogue and reused by the reader for the conversations it listed
 * (the review of 2026-09-29, `.ai/plans/2026-09-29-what-codex-wrote.md`): the root's headers are read once per listing,
 * not once per conversation. It is only ever the latest - every listing replaces it - so a thread started since is in
 * the next one, and nothing is kept past it.
 *
 * A listing asked for while one of the same folder is being taken is that one (`everything-on-this-computer.md` step 2,
 * G11): every project's conversations are listed at once, and Codex keeps them all in one root - walked once for all of
 * them, not once a project.
 */
export class CodexSessionIndex {
  readonly #discovery: CodexSessionDiscovery;
  #latest: KnownListing | undefined;
  #taking: { readonly directory: string; readonly listing: Promise<CodexListing> } | undefined;

  constructor(discovery: CodexSessionDiscovery) {
    this.#discovery = discovery;
  }

  async list(directory: string): Promise<CodexListing> {
    const taking = this.#taking;
    if (taking !== undefined && taking.directory === directory) return taking.listing;
    const listing = this.#discovery.list(directory).then((taken) => {
      this.#latest = { directory, listing: taken };
      return taken;
    });
    this.#taking = { directory, listing };
    try {
      return await listing;
    } finally {
      if (this.#taking?.listing === listing) this.#taking = undefined;
    }
  }

  latest(): KnownListing | undefined {
    return this.#latest;
  }
}
