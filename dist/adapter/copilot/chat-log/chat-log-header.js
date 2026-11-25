// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { FileAccessError } from '../../../ports/file-access-error.js';
import { isJsonObject, parseJsonObject } from '../../../shared/json.js';
import { CHAT, CHAT_LOG } from '../contract/vs-code.js';
/**
 * A VS Code chat log's first line (`what-vs-code-copilot-wrote` VCD1, VCB-M2, VCB-M4): the snapshot, `kind` 0, of a chat
 * with a `version`, a session id and its `requests`. Its version is not asked here: a log of a version not measured is
 * Copilot's still, read as one (VC2). Copilot's own transcript in VS Code is a `session.start` line, and none of this.
 */
export function chatLogHeaderOf(line) {
    const record = parseJsonObject(line);
    if (record === undefined || record[CHAT_LOG.kind] !== CHAT_LOG.snapshot)
        return undefined;
    const chat = record[CHAT_LOG.value];
    if (!isJsonObject(chat) || !Object.hasOwn(chat, CHAT.version) || !Array.isArray(chat[CHAT.requests]))
        return undefined;
    const sessionId = chat[CHAT.sessionId];
    return typeof sessionId === 'string' && sessionId !== '' ? { sessionId } : undefined;
}
/** Reads a file's first line alone, and closes it. */
export async function readChatLogHeader(files, path) {
    try {
        for await (const line of files.readLines(path)) {
            const header = chatLogHeaderOf(line);
            return header === undefined ? { kind: 'unknown' } : { kind: 'recognised', header };
        }
        return { kind: 'unknown' };
    }
    catch (error) {
        if (error instanceof FileAccessError)
            return { kind: 'unavailable', failure: error.failure };
        throw error;
    }
}
