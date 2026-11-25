// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0

/**
 * What a person can ask agentwhy in the chat (`2026-11-24-talking-about-agentwhy.md` CV1): a closed list, chosen by the AI from an
 * ordinary sentence and checked before anything is read. The sentence itself never reaches agentwhy (AY5).
 */
export const CONVERSATION_ANSWERS = ['summary', 'steps', 'files', 'helpers', 'todo'] as const;
export const LIST_ANSWERS = ['okay', 'conversations', 'attention', 'tracked', 'stopped', 'often'] as const;
export const ANSWERS = [...CONVERSATION_ANSWERS, ...LIST_ANSWERS] as const;

export type ConversationAnswerKind = (typeof CONVERSATION_ANSWERS)[number];
export type ListAnswerKind = (typeof LIST_ANSWERS)[number];
export type AnswerKind = (typeof ANSWERS)[number];

/** CV15: the project the conversation is in, or what the page's view of that name lists. */
export const ANSWER_SCOPES = ['project', 'computer'] as const;
export type AnswerScope = (typeof ANSWER_SCOPES)[number];

export const isAnswer = (word: string): word is AnswerKind => (ANSWERS as readonly string[]).includes(word);
export const isListAnswer = (word: string): word is ListAnswerKind => (LIST_ANSWERS as readonly string[]).includes(word);
export const isConversationAnswer = (word: string): word is ConversationAnswerKind => (CONVERSATION_ANSWERS as readonly string[]).includes(word);
