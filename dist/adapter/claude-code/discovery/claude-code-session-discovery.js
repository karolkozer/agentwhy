// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { basename, join, resolve } from 'node:path';
import { FileAccessError } from '../../../ports/file-access-error.js';
import { byString } from '../../../shared/compare.js';
import { LAYOUT } from '../contract/layout.js';
import { CONTRACT_VERSION } from '../contract/version.js';
import { pairSubagentFiles, splitToolResults } from './session-entries.js';
export class ClaudeCodeSessionDiscovery {
    #directories;
    constructor(directories) {
        this.#directories = directories;
    }
    async discover(input) {
        const target = resolve(input);
        const sessionDir = target.endsWith(LAYOUT.transcriptSuffix)
            ? target.slice(0, -LAYOUT.transcriptSuffix.length)
            : target;
        const [mainTranscript, subagentsListing, toolResultsListing] = await Promise.all([
            this.#presence(sessionDir + LAYOUT.transcriptSuffix, 'file'),
            this.#list(join(sessionDir, LAYOUT.subagentsDir)),
            this.#list(join(sessionDir, LAYOUT.toolResultsDir)),
        ]);
        const subagents = pairSubagentFiles(subagentsListing);
        const toolResults = splitToolResults(toolResultsListing);
        return {
            contractVersion: CONTRACT_VERSION,
            sessionId: basename(sessionDir),
            mainTranscript,
            subagentsDir: subagentsListing.presence,
            subagents: subagents.sources,
            toolResultsDir: toolResultsListing.presence,
            toolResultFiles: toolResults.files,
            unrecognised: [...subagents.unrecognised, ...toolResults.unrecognised].sort(byString),
        };
    }
    async #presence(path, expected) {
        try {
            const kind = await this.#directories.kindOf(path);
            return kind === expected ? { present: true, path } : { present: false, path, reason: 'wrong-kind' };
        }
        catch (error) {
            if (error instanceof FileAccessError)
                return { present: false, path, reason: error.failure };
            throw error;
        }
    }
    // A directory counts as present only once it has been listed: it can exist and still refuse to be read.
    async #list(path) {
        const found = await this.#presence(path, 'directory');
        if (!found.present)
            return { presence: found, entries: [] };
        try {
            return { presence: found, entries: await this.#directories.list(path) };
        }
        catch (error) {
            if (error instanceof FileAccessError) {
                return { presence: { present: false, path, reason: error.failure }, entries: [] };
            }
            throw error;
        }
    }
}
