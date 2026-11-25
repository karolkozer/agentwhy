// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
export const CONVERSATION_LINE_TYPES = ['user', 'assistant'];
export const SKIPPED_LINE_TYPES = [
    'attachment',
    'queue-operation',
    'atis-latch',
    'last-prompt',
    'ai-title',
    'system',
    'file-history-snapshot',
    'file-history-delta',
    'bridge-session',
];
export const SYSTEM_LINE_TYPE = 'system';
/** The line an agent writes on. A user line carries text blocks too, and they are not the agent's words. */
export const ASSISTANT_LINE_TYPE = 'assistant';
/** The line a result arrives on, and a report delivered late. Its words are not the words of the agent it reaches. */
export const USER_LINE_TYPE = 'user';
export function classifyLineType(type) {
    if (typeof type !== 'string')
        return 'unknown';
    if (CONVERSATION_LINE_TYPES.includes(type))
        return 'conversation';
    if (SKIPPED_LINE_TYPES.includes(type))
        return 'skipped';
    return 'unknown';
}
