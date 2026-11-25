// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { ENVELOPE } from '../contract/envelope.js';
import { SESSION } from '../contract/session.js';
import { PRE_TOOL_USE } from '../contract/hooks.js';
import { entryPointOf } from '../discovery/held-in.js';
import { isJsonObject, parseJsonObject } from '../../../shared/json.js';
import { FileAccessError } from '../../../ports/file-access-error.js';
/**
 * Where a hook's conversation is held, from the first line of the rollout its input names (`where-it-was-held` WH6) -
 * read only for a refused message that is a conversation's first (`2026-11-01-a-key-in-your-message.md` PK11). Its first
 * line alone is read, however long the rollout. Nothing readable is nothing said.
 */
export async function heldInRollout(files, hookInput) {
    const path = parseJsonObject(hookInput)?.[PRE_TOOL_USE.fields.transcriptPath];
    if (typeof path !== 'string' || path === '')
        return undefined;
    const first = await firstLine(files, path);
    const line = first === undefined ? undefined : parseJsonObject(first);
    if (line?.type !== SESSION.metadataType)
        return undefined;
    const payload = line[ENVELOPE.payload];
    return isJsonObject(payload) ? entryPointOf(payload[SESSION.source], payload[SESSION.originator]) : undefined;
}
async function firstLine(files, path) {
    try {
        for await (const line of files.readLines(path))
            return line;
        return undefined;
    }
    catch (error) {
        if (!(error instanceof FileAccessError))
            throw error;
        return undefined;
    }
}
