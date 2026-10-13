// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { CopilotListing, CopilotSessionDiscovery } from './copilot-session-discovery.ts';

/**
 * One listing of the sessions root at a time: a listing asked for while one of the same folder is being taken is that
 * one, so a page that lists a project's conversations and the person's projects at once walks the root once. Nothing is
 * kept past it - every listing is taken anew - so a session started since is in the next one.
 */
export class CopilotSessionIndex {
  readonly #discovery: CopilotSessionDiscovery;
  #taking: { readonly root: string; readonly listing: Promise<CopilotListing> } | undefined;

  constructor(discovery: CopilotSessionDiscovery) {
    this.#discovery = discovery;
  }

  async list(root: string): Promise<CopilotListing> {
    const taking = this.#taking;
    if (taking !== undefined && taking.root === root) return taking.listing;
    const listing = this.#discovery.list(root);
    this.#taking = { root, listing };
    try {
      return await listing;
    } finally {
      if (this.#taking?.listing === listing) this.#taking = undefined;
    }
  }
}
