// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { AlertStore, RememberedAlert } from '../../src/ports/alert-store.ts';

/** The store as the hooks see it, without a disk: what one run leaves, the next run takes. */
export function memoryStore(): AlertStore & { readonly kept: Map<string, RememberedAlert[]> } {
  const kept = new Map<string, RememberedAlert[]>();
  const of = (sessionId: string): RememberedAlert[] => kept.get(sessionId) ?? [];
  const without = (sessionId: string, agentId: string): RememberedAlert[] => of(sessionId).filter((one) => one.agentId !== agentId);
  return {
    kept,
    remember: async (sessionId, alert) => {
      kept.set(sessionId, [...without(sessionId, alert.agentId), alert]);
    },
    rememberOnce: async (sessionId, alert) => {
      if (of(sessionId).some((one) => one.agentId === alert.agentId)) return false;
      kept.set(sessionId, [...of(sessionId), alert]);
      return true;
    },
    take: async (sessionId, leaving = []) => {
      const session = of(sessionId);
      kept.set(sessionId, session.filter((one) => leaving.includes(one.agentId)));
      return session;
    },
    forget: async (sessionId, agentId) => {
      kept.set(sessionId, without(sessionId, agentId));
    },
    peek: async (sessionId) => of(sessionId),
  };
}
