// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { FileAccessError } from '../../../ports/file-access-error.js';
import { toLabel } from '../../../shared/label.js';
import { CONTRACT_VERSION, VERIFIED_AGAINST } from '../contract/version.js';
import { MetaTally } from './meta-tally.js';
import { SessionTally } from './session-tally.js';
import { TranscriptTally } from './transcript-tally.js';
export class ClaudeCodeProbe {
    #files;
    constructor(files) {
        this.#files = files;
    }
    async probe(session) {
        const tally = new SessionTally();
        const main = new TranscriptTally(tally.collectors);
        const subagents = new TranscriptTally(tally.collectors);
        if (session.mainTranscript.present)
            await this.#readTranscript(session.mainTranscript.path, main);
        for (const source of session.subagents) {
            if (source.transcript.present)
                await this.#readTranscript(source.transcript.path, subagents);
        }
        const meta = await this.#readMeta(session.subagents);
        return {
            schemaVersion: 4,
            contractVersion: CONTRACT_VERSION,
            verifiedAgainst: VERIFIED_AGAINST.claudeCode,
            sessionId: toLabel(session.sessionId),
            sources: sourcesOf(session),
            toolVersions: tally.toolVersions(),
            workingDirectories: tally.workingDirectories(),
            main: main.toStats(),
            subagents: subagents.toStats(),
            meta,
            agentToolInputKeys: tally.agentToolInputKeys(),
            denials: tally.denials(),
            toolResultReferences: tally.toolResultReferences(session.toolResultFiles),
            taskNotifications: tally.taskNotifications(),
        };
    }
    async #readTranscript(path, tally) {
        tally.recordFile();
        try {
            for await (const raw of this.#files.readLines(path))
                tally.recordLine(raw);
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            tally.recordUnreadableFile();
        }
    }
    async #readMeta(sources) {
        const tally = new MetaTally();
        for (const source of sources) {
            if (!source.meta.present)
                continue;
            try {
                tally.recordFile(await this.#files.readText(source.meta.path));
            }
            catch (error) {
                if (!(error instanceof FileAccessError))
                    throw error;
                tally.recordUnreadableFile();
            }
        }
        return tally.toStats();
    }
}
function sourcesOf(session) {
    return {
        mainTranscript: state(session.mainTranscript),
        subagentsDirectory: state(session.subagentsDir),
        toolResultsDirectory: state(session.toolResultsDir),
        subagentFiles: {
            total: session.subagents.length,
            withTranscript: session.subagents.filter((source) => source.transcript.present).length,
            withMeta: session.subagents.filter((source) => source.meta.present).length,
            incompletePairs: session.subagents.filter((source) => source.transcript.present !== source.meta.present).length,
        },
        toolResultFiles: session.toolResultFiles.length,
        unrecognisedEntries: session.unrecognised.length,
    };
}
function state(presence) {
    return presence.present ? 'present' : presence.reason;
}
