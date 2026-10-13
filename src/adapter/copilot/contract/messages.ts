// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Who said what (spec §2.8, §2.16). `user.message.content` is what the person typed. Its `transformedContent` was longer on
 * 44 of 44 messages and held `content` on 42: what the runtime handed the model, never the person's words.
 * `assistant.message.content` is the agent's own words,
 * empty on a message that only asks for calls. `system.message` is instructions the model was given: context, never the
 * agent's words. Reasoning is `reasoningBlocks` with encrypted content; `reasoningText` was non-empty on some messages and is
 * never read as a reason (CP16).
 */
export const MESSAGE = {
  content: 'content',
  /** Which channel the words are (CPB57, CP31): absent on most messages. */
  phase: 'phase',
  messageId: 'messageId',
  interactionId: 'interactionId',
  reasoningText: 'reasoningText',
} as const;

/** `phase`'s values, and the core's channel each is (`what-codex-wrote` X31). Any other value names no channel. */
export const PHASES = { final: 'final_answer', commentary: 'commentary' } as const;

/** A compaction's summary: a model's text the agent received after it (CPB37, CP27) - context, never its own words. */
export const COMPACTION = { summary: 'summaryContent' } as const;
