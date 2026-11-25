// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { SUBAGENT_STOP } from '../contract/hooks.js';
import { parseJsonObject } from '../../../shared/json.js';
/** Reads the text a hook was given on standard input. Never throws: an input it cannot use is a named answer. */
export function parseSubagentStopInput(text) {
    const input = parseJsonObject(text);
    if (input === undefined)
        return { unusable: 'not-json' };
    const { fields } = SUBAGENT_STOP;
    if (input[fields.event] !== SUBAGENT_STOP.event)
        return { unusable: 'another-event' };
    const transcriptPath = input[fields.transcriptPath];
    const agentId = input[fields.agentId];
    if (typeof transcriptPath !== 'string' || transcriptPath === '' || typeof agentId !== 'string' || agentId === '') {
        return { unusable: 'field-missing' };
    }
    const lastMessage = input[fields.lastMessage];
    const sessionId = input[fields.sessionId];
    const agentTranscriptPath = input[fields.agentTranscriptPath];
    return {
        agent: {
            transcriptPath,
            agentId,
            ...(typeof lastMessage === 'string' ? { lastMessage } : {}),
            ...(typeof sessionId === 'string' && sessionId !== '' ? { sessionId } : {}),
            ...(typeof agentTranscriptPath === 'string' && agentTranscriptPath !== '' ? { agentTranscriptPath } : {}),
        },
    };
}
