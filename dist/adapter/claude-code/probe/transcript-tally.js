// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { parseJsonObject } from '../../../shared/json.js';
import { DeniedCallCollector } from './collectors/denied-call-collector.js';
import { IdentifierCollector } from './collectors/identifier-collector.js';
import { LineTypeCollector } from './collectors/line-type-collector.js';
import { SidechainCollector } from './collectors/sidechain-collector.js';
import { ToolUseCollector } from './collectors/tool-use-collector.js';
import { TopLevelKeyCollector } from './collectors/top-level-key-collector.js';
import { UnknownLineTypeKeyCollector } from './collectors/unknown-line-type-key-collector.js';
/**
 * Statistics for one group of transcripts (main session or subagents). Composed of collectors: its own, which
 * measure this group, and the session's, which measure across groups.
 */
export class TranscriptTally {
    #files = 0;
    #unreadableFiles = 0;
    #lines = 0;
    #unparsableLines = 0;
    #identifiers = new IdentifierCollector();
    #topLevelKeys = new TopLevelKeyCollector();
    #lineTypes = new LineTypeCollector();
    #unknownLineTypeKeys = new UnknownLineTypeKeyCollector();
    #sidechain = new SidechainCollector();
    #toolUses = new ToolUseCollector();
    #deniedCalls = new DeniedCallCollector();
    #collectors;
    constructor(sessionCollectors) {
        this.#collectors = [
            this.#identifiers,
            this.#topLevelKeys,
            this.#lineTypes,
            this.#unknownLineTypeKeys,
            this.#sidechain,
            this.#toolUses,
            this.#deniedCalls,
            ...sessionCollectors,
        ];
    }
    recordFile() {
        this.#files += 1;
    }
    recordUnreadableFile() {
        this.#unreadableFiles += 1;
    }
    recordLine(raw) {
        if (raw.trim() === '')
            return;
        this.#lines += 1;
        const json = parseJsonObject(raw);
        if (json === undefined)
            this.#unparsableLines += 1;
        const line = { raw, json };
        for (const collector of this.#collectors)
            collector.collect(line);
    }
    toStats() {
        return {
            files: this.#files,
            unreadableFiles: this.#unreadableFiles,
            lines: this.#lines,
            unparsableLines: this.#unparsableLines,
            lineTypes: this.#lineTypes.lineTypes(),
            unknownLineTypes: this.#lineTypes.unknownLineTypes(),
            unknownLineTypeKeys: this.#unknownLineTypeKeys.keysByType(),
            topLevelKeys: this.#topLevelKeys.counts(),
            sidechain: this.#sidechain.stats(),
            systemSubtypes: this.#lineTypes.systemSubtypes(),
            tools: this.#toolUses.tools(),
            agentToolUses: this.#toolUses.agentToolUses(),
            deniedCalls: this.#deniedCalls.deniedCalls(),
            uniqueToolUseIds: this.#identifiers.uniqueToolUseIds(),
            uniqueUuids: this.#identifiers.uniqueUuids(),
        };
    }
}
