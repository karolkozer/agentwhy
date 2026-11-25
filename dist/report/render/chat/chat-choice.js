// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { CONVERSATION_ANSWERS } from '../../answers/answer-kinds.js';
/**
 * The words a person can add after `/agentwhy:why` (`2026-11-20-ask-your-ai-why.md` AY5, AYD7): a closed list, checked
 * before any session is read. Nothing else a person types reaches a command.
 */
export const CHAT_VIEWS = ['steps', 'folders', 'table', 'diagram', 'card'];
/** The answers of `2026-11-24-talking-about-agentwhy.md` CV1 that a view has no word for already; `steps` stays the view. */
export const CHAT_ANSWERS = CONVERSATION_ANSWERS.filter((answer) => !CHAT_VIEWS.includes(answer));
/** Every word that may follow `why`: the views and the answers. */
export const CHAT_WORD_LIST = [...CHAT_VIEWS, ...CHAT_ANSWERS];
export const isChatView = (word) => CHAT_VIEWS.includes(word);
