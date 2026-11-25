// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { HOOK_INPUT, SESSION_START } from '../contract/hooks.js';
import { parseJsonObject } from '../../../shared/json.js';
/** The input of one `SessionStart` hook, or `unusable` where it is not JSON or not this event's. */
export function parseSessionStartInput(text) {
    const input = parseJsonObject(text);
    if (input === undefined || input[SESSION_START.fields.event] !== SESSION_START.event)
        return { unusable: true };
    const source = input[SESSION_START.fields.source];
    const cwd = input[HOOK_INPUT.fields.workingDirectory];
    return {
        ...(typeof source === 'string' ? { source } : {}),
        ...(typeof cwd === 'string' && cwd !== '' ? { cwd } : {}),
    };
}
