// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { HOOK_INPUT, PRE_TOOL_USE } from '../contract/hooks.js';
import { parseJsonObject } from '../../../shared/json.js';
/** Claude Code's `PreToolUse` input for `Write` or `Edit`. Never throws: any other event, tool or shape is nothing. */
export function parseFileWriteInput(text) {
    const input = parseJsonObject(text);
    if (input === undefined || input[PRE_TOOL_USE.fields.event] !== PRE_TOOL_USE.event)
        return undefined;
    const tool = input[PRE_TOOL_USE.fields.toolName];
    const args = input[PRE_TOOL_USE.fields.toolInput];
    if (typeof args !== 'object' || args === null || Array.isArray(args))
        return undefined;
    const fields = args;
    const path = fields[PRE_TOOL_USE.fields.filePath];
    if (typeof path !== 'string' || path === '')
        return undefined;
    const folder = input[HOOK_INPUT.fields.workingDirectory];
    const directory = typeof folder === 'string' && folder !== '' ? folder : undefined;
    if (tool === PRE_TOOL_USE.writeTool) {
        const content = fields[PRE_TOOL_USE.fields.content];
        return typeof content === 'string' ? { path, newText: content, replaced: undefined, directory } : undefined;
    }
    if (tool === PRE_TOOL_USE.editTool) {
        const oldText = fields[PRE_TOOL_USE.fields.oldString];
        const newText = fields[PRE_TOOL_USE.fields.newString];
        return typeof oldText === 'string' && typeof newText === 'string' ? { path, newText, replaced: oldText, directory } : undefined;
    }
    return undefined;
}
