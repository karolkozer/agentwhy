// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { heldByPerson } from '../discovery/held-in.js';
import { FileAccessError } from '../../../ports/file-access-error.js';
import { isJsonObject, parseJsonObject } from '../../../shared/json.js';
import { READER, SESSION } from '../contract/session.js';
const NOBODY = { attended: false, quietSaidByAgent: false, foldsTurn: false, showsLine: false };
/**
 * Read from the rollout's first line, the one line it is read for. A rollout that cannot be read, or a first line that
 * is not Codex's, is nobody reading: the agent is then never asked to speak, and the line is said all the same.
 */
export async function codexReaderOf(files, rollout) {
    if (rollout === undefined)
        return NOBODY;
    const lines = files.readLines(rollout)[Symbol.asyncIterator]();
    try {
        const first = await lines.next();
        const line = first.done === true ? undefined : parseJsonObject(first.value);
        if (line?.[SESSION.lineType] !== SESSION.metadataType)
            return NOBODY;
        const payload = line[SESSION.payload];
        if (!isJsonObject(payload))
            return NOBODY;
        const originator = payload[SESSION.originator];
        if (!heldByPerson(payload[SESSION.source], originator))
            return NOBODY;
        return {
            attended: true,
            quietSaidByAgent: originator !== READER.terminalOriginator,
            foldsTurn: typeof originator === 'string' && READER.desktopOriginators.includes(originator),
            showsLine: originator === READER.terminalOriginator,
        };
    }
    catch (error) {
        if (error instanceof FileAccessError)
            return NOBODY;
        throw error;
    }
    finally {
        await lines.return?.();
    }
}
