// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isJsonObject } from '../../../shared/json.js';
import { FIELDS, TEXT_BLOCK_TYPE, TOOL_RESULT_BLOCK_TYPE, TOOL_USE_BLOCK_TYPE } from '../contract/fields.js';
export function contentBlocks(line) {
    const message = line[FIELDS.message];
    const content = isJsonObject(message) ? message[FIELDS.messageContent] : undefined;
    return Array.isArray(content) ? content.filter(isJsonObject) : [];
}
export function toolUseBlocks(line) {
    return contentBlocks(line).filter((block) => block[FIELDS.blockType] === TOOL_USE_BLOCK_TYPE);
}
/**
 * The words on a line that holds no tool result - its content as a string, or the text of its text blocks - where a
 * report delivered late is written. Undefined for a line carrying a result, or no words.
 */
export function wordsWithoutResult(line) {
    const message = line[FIELDS.message];
    const content = isJsonObject(message) ? message[FIELDS.messageContent] : undefined;
    if (typeof content === 'string')
        return content;
    if (!Array.isArray(content))
        return undefined;
    const blocks = content.filter(isJsonObject);
    if (blocks.some((block) => block[FIELDS.blockType] === TOOL_RESULT_BLOCK_TYPE))
        return undefined;
    const words = blocks
        .filter((block) => block[FIELDS.blockType] === TEXT_BLOCK_TYPE)
        .map((block) => block[FIELDS.blockText])
        .filter((text) => typeof text === 'string');
    return words.length === 0 ? undefined : words.join('\n');
}
