// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { FIELDS, TOOL_RESULT_BLOCK_TYPE } from '../../contract/fields.js';
import { toolResultReferences } from '../../contract/layout.js';
import { contentBlocks } from '../transcript-line.js';
export class ToolResultReferenceCollector {
    #referenced = new Set();
    // Only result positions count. A tool-results path in a prompt, in assistant text or in a tool input is a
    // mention, not a spill reference, and counting it would report a missing spilled result that never existed
    // (lesson L009).
    collect({ json }) {
        if (json === undefined)
            return;
        const results = [json[FIELDS.toolUseResult]];
        for (const block of contentBlocks(json)) {
            if (block[FIELDS.blockType] === TOOL_RESULT_BLOCK_TYPE)
                results.push(block[FIELDS.blockContent]);
        }
        for (const result of results) {
            if (result === undefined)
                continue;
            const text = typeof result === 'string' ? result : JSON.stringify(result);
            for (const name of toolResultReferences(text))
                this.#referenced.add(name);
        }
    }
    // Counts only: a file name captured from a transcript is free text and must not reach the output (lesson L009).
    stats(availableFiles) {
        const available = new Set(availableFiles);
        const referenced = [...this.#referenced];
        return { referenced: referenced.length, missing: referenced.filter((name) => !available.has(name)).length };
    }
}
