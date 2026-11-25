// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { CONVERSATION_ANSWERS, type ConversationAnswerKind } from '../../answers/answer-kinds.ts';
import type { Lang } from '../report-copy.ts';

/**
 * The words a person can add after `/agentwhy:why` (`2026-11-20-ask-your-ai-why.md` AY5, AYD7): a closed list, checked
 * before any session is read. Nothing else a person types reaches a command.
 */
export const CHAT_VIEWS = ['steps', 'folders', 'table', 'diagram', 'card'] as const;
export type ChatView = (typeof CHAT_VIEWS)[number];

/** The answers of `2026-11-24-talking-about-agentwhy.md` CV1 that a view has no word for already; `steps` stays the view. */
export const CHAT_ANSWERS: readonly ConversationAnswerKind[] = CONVERSATION_ANSWERS.filter((answer) => !(CHAT_VIEWS as readonly string[]).includes(answer));

/** Every word that may follow `why`: the views and the answers. */
export const CHAT_WORD_LIST: readonly string[] = [...CHAT_VIEWS, ...CHAT_ANSWERS];

export const isChatView = (word: string): word is ChatView => (CHAT_VIEWS as readonly string[]).includes(word);

/** What one answer in the chat is asked for. */
export interface ChatChoice {
  /** One of the views; absent, the default answer. */
  readonly view?: ChatView;
  /** One of the answers, instead of a view. */
  readonly answer?: ConversationAnswerKind;
  /** `--json`: the answer as data, for a card to draw. */
  readonly json?: true;
  /** The conversation's files the person marked done, by the paths its report names. */
  readonly done?: ReadonlySet<string>;
  readonly lang: Lang;
}
