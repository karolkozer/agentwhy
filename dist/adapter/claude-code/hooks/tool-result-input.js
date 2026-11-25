// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { HOOK_INPUT, POST_TOOL_USE, POST_TOOL_USE_FAILURE } from '../contract/hooks.js';
import { parseJsonObject } from '../../../shared/json.js';
/** Claude Code's `PostToolUse` and `PostToolUseFailure` inputs. Never throws: what cannot be used is nothing. */
export function parseToolResultInput(text) {
    const input = parseJsonObject(text);
    if (input === undefined)
        return undefined;
    const event = input[POST_TOOL_USE.fields.event];
    const folder = input[HOOK_INPUT.fields.workingDirectory];
    const directory = typeof folder === 'string' && folder !== '' ? folder : undefined;
    if (event === POST_TOOL_USE.event) {
        const result = input[POST_TOOL_USE.fields.response];
        return result === undefined ? undefined : { kind: 'result', result, directory };
    }
    if (event === POST_TOOL_USE_FAILURE.event) {
        const error = input[POST_TOOL_USE_FAILURE.fields.error];
        return typeof error === 'string' ? { kind: 'failure', error, directory } : undefined;
    }
    return undefined;
}
