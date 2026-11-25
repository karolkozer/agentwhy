// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { identifierMatches } from '../../contract/identifiers.js';
export class IdentifierCollector {
    #toolUseIds = new Set();
    #uuids = new Set();
    // Reads the raw text, so the identifiers on an unparsable line still count.
    collect({ raw }) {
        const identifiers = identifierMatches(raw);
        for (const id of identifiers.toolUseIds)
            this.#toolUseIds.add(id);
        for (const id of identifiers.uuids)
            this.#uuids.add(id);
    }
    uniqueToolUseIds() {
        return this.#toolUseIds.size;
    }
    uniqueUuids() {
        return this.#uuids.size;
    }
}
