// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { STOP, SUBAGENT_STOP } from '../contract/hooks.js';
import { parseJsonObject } from '../../../shared/json.js';
export function parseStopInput(text) {
    const input = parseJsonObject(text);
    if (input === undefined)
        return { unusable: 'not-json' };
    const { fields } = STOP;
    if (input[fields.event] !== STOP.event)
        return { unusable: 'another-event' };
    const sessionId = input[fields.sessionId];
    if (typeof sessionId !== 'string' || sessionId === '')
        return { unusable: 'field-missing' };
    const transcriptPath = input[SUBAGENT_STOP.fields.transcriptPath];
    const lastMessage = input[SUBAGENT_STOP.fields.lastMessage];
    return {
        turn: {
            sessionId,
            // Anything but `true` is read as "not inside one": a flag this version cannot read must never be the reason
            // a person is told nothing, and the block it guards is refused by the store's own record as well.
            active: input[fields.active] === true,
            ...(typeof transcriptPath === 'string' && transcriptPath !== '' ? { transcriptPath } : {}),
            ...(typeof lastMessage === 'string' ? { lastMessage } : {}),
        },
    };
}
