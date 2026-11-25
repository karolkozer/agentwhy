// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { STOP } from '../contract/hooks.js';
import { parseJsonObject } from '../../../shared/json.js';
/** Codex's `Stop` input, read by the names Codex gives it. Never throws: what cannot be used is named. */
export function parseCodexStopInput(text) {
    const input = parseJsonObject(text);
    if (input === undefined)
        return { unusable: 'not-json' };
    const { fields } = STOP;
    if (input[fields.event] !== STOP.event)
        return { unusable: 'another-event' };
    const sessionId = input[fields.sessionId];
    if (typeof sessionId !== 'string' || sessionId === '')
        return { unusable: 'field-missing' };
    const transcriptPath = input[fields.transcriptPath];
    const lastMessage = input[fields.lastMessage];
    return {
        turn: {
            sessionId,
            // As for Claude Code: anything but `true` is no continuation, and the store refuses a second block anyway.
            active: input[fields.active] === true,
            ...(typeof transcriptPath === 'string' && transcriptPath !== '' ? { transcriptPath } : {}),
            ...(typeof lastMessage === 'string' ? { lastMessage } : {}),
        },
    };
}
/** The folder a Codex hook ran in: where the project's rules are looked for (CK3). */
export function codexStopFolder(text) {
    const folder = parseJsonObject(text)?.[STOP.fields.workingDirectory];
    return typeof folder === 'string' && folder !== '' ? folder : undefined;
}
