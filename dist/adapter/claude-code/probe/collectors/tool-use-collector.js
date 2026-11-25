// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { Counter } from '../../../../shared/counter.js';
import { toLabel } from '../../../../shared/label.js';
import { AGENT_TOOL, FIELDS } from '../../contract/fields.js';
import { toolUseBlocks } from '../transcript-line.js';
export class ToolUseCollector {
    #tools = new Counter();
    #agentToolUses = 0;
    collect({ json }) {
        if (json === undefined)
            return;
        for (const block of toolUseBlocks(json)) {
            const name = block[FIELDS.toolName];
            this.#tools.add(toLabel(name));
            if (name === AGENT_TOOL.name)
                this.#agentToolUses += 1;
        }
    }
    tools() {
        return this.#tools.toCounts();
    }
    agentToolUses() {
        return this.#agentToolUses;
    }
}
