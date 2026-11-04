// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { AlertStore } from '../ports/alert-store.ts';
import type { RefusalMemory } from './key-message-check.ts';

/** Its own key beside the session's: `Stop` takes the session's alerts by its id, and must never take this for one. */
const KEY = (sessionId: string): string => `${sessionId}.refused-message`;
const AGENT = 'refused-message';
/** PK11: a mark that a message of the conversation went, beside the note, and never taken with it. */
const WENT = (sessionId: string): string => `${sessionId}.message-went`;
const WENT_AGENT = 'message-went';

/**
 * PK10's memory in the store `watch` already keeps a turn's alerts in - outside every project, its own user's, swept by
 * age (`a-notice-in-the-conversation` R7). The note is the remembered alert's words; nothing else of an alert is used.
 */
export function refusalMemory(store: AlertStore): RefusalMemory {
  return {
    keep: (sessionId, note) => store.remember(KEY(sessionId), { agentId: AGENT, level: 'refused', words: note }),
    take: async (sessionId) => (await store.take(KEY(sessionId))).find((alert) => alert.agentId === AGENT)?.words,
    wentBefore: async (sessionId) => (await store.peek(WENT(sessionId))).some((alert) => alert.agentId === WENT_AGENT),
    markWent: (sessionId) => store.remember(WENT(sessionId), { agentId: WENT_AGENT, level: 'went', words: '' }),
  };
}
