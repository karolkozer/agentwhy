// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { Counter } from '../../../../shared/counter.js';
import { isJsonObject } from '../../../../shared/json.js';
import { toLabel } from '../../../../shared/label.js';
import { AGENT_TOOL, FIELDS } from '../../contract/fields.js';
import { toolUseBlocks } from '../transcript-line.js';
export class AgentToolInputKeyCollector {
    #keys = new Counter();
    collect({ json }) {
        if (json === undefined)
            return;
        for (const block of toolUseBlocks(json)) {
            if (block[FIELDS.toolName] !== AGENT_TOOL.name)
                continue;
            const input = block[FIELDS.toolInput];
            if (isJsonObject(input)) {
                for (const key of Object.keys(input))
                    this.#keys.add(toLabel(key));
            }
        }
    }
    counts() {
        return this.#keys.toCounts();
    }
}
