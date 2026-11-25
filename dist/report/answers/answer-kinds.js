// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * What a person can ask agentwhy in the chat (`2026-11-24-talking-about-agentwhy.md` CV1): a closed list, chosen by the AI from an
 * ordinary sentence and checked before anything is read. The sentence itself never reaches agentwhy (AY5).
 */
export const CONVERSATION_ANSWERS = ['summary', 'steps', 'files', 'helpers', 'todo'];
export const LIST_ANSWERS = ['okay', 'conversations', 'attention', 'tracked', 'stopped', 'often'];
export const ANSWERS = [...CONVERSATION_ANSWERS, ...LIST_ANSWERS];
/** CV15: the project the conversation is in, or what the page's view of that name lists. */
export const ANSWER_SCOPES = ['project', 'computer'];
export const isAnswer = (word) => ANSWERS.includes(word);
export const isListAnswer = (word) => LIST_ANSWERS.includes(word);
export const isConversationAnswer = (word) => CONVERSATION_ANSWERS.includes(word);
