// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { Counter } from '../../../shared/counter.js';
import { parseJsonObject } from '../../../shared/json.js';
import { toLabel } from '../../../shared/label.js';
import { META_FIELD } from '../contract/fields.js';
/** Statistics over the meta.json files of a session's subagents. */
export class MetaTally {
    #files = 0;
    #unreadableFiles = 0;
    #unparsableFiles = 0;
    #keys = new Counter();
    #agentType = new Counter();
    #spawnDepth = new Counter();
    #requestShape = new Counter();
    recordUnreadableFile() {
        this.#files += 1;
        this.#unreadableFiles += 1;
    }
    recordFile(text) {
        this.#files += 1;
        const meta = parseJsonObject(text);
        if (meta === undefined) {
            this.#unparsableFiles += 1;
            return;
        }
        for (const key of Object.keys(meta))
            this.#keys.add(toLabel(key));
        this.#agentType.add(toLabel(meta[META_FIELD.agentType]));
        this.#spawnDepth.add(toLabel(meta[META_FIELD.spawnDepth]));
        this.#requestShape.add(toLabel(meta[META_FIELD.requestShape]));
    }
    toStats() {
        return {
            files: this.#files,
            unreadableFiles: this.#unreadableFiles,
            unparsableFiles: this.#unparsableFiles,
            keys: this.#keys.toCounts(),
            agentType: this.#agentType.toCounts(),
            spawnDepth: this.#spawnDepth.toCounts(),
            requestShape: this.#requestShape.toCounts(),
        };
    }
}
