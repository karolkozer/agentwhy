// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { STOP, SUBAGENT_STOP } from '../contract/hooks.ts';
import { parseJsonObject } from '../../../shared/json.ts';
import type { UnusableInput } from './subagent-stop-input.ts';

/**
 * What `watch` needs from a `Stop` input: the session whose turn has ended, and nothing else
 * (`specs/2026-09-16-a-notice-in-the-conversation.md` R6). The finding was made when the agent finished; this event
 * only says it.
 */
export interface FinishedTurn {
  readonly sessionId: string;
  /** The primary transcript, which is the session (`the-agent-nobody-watches.md` R3). Absent where it was not given. */
  readonly transcriptPath?: string;
  /** B8b: on the input on 5 of 5, 25 to 711 characters. Read the way R9 reads a finished agent's last words. */
  readonly lastMessage?: string;
  /** This run is already inside a continuation a block caused (B9c): nothing may block again (R13). */
  readonly active: boolean;
}

export function parseStopInput(text: string): { readonly turn: FinishedTurn } | { readonly unusable: UnusableInput } {
  const input = parseJsonObject(text);
  if (input === undefined) return { unusable: 'not-json' };

  const { fields } = STOP;
  if (input[fields.event] !== STOP.event) return { unusable: 'another-event' };

  const sessionId = input[fields.sessionId];
  if (typeof sessionId !== 'string' || sessionId === '') return { unusable: 'field-missing' };

  const transcriptPath = input[SUBAGENT_STOP.fields.transcriptPath];
  const lastMessage = input[SUBAGENT_STOP.fields.lastMessage];
  return {
    turn: {
      sessionId,
      // Anything but `true` is read as "not inside one": a flag this version cannot read must never be the reason
      // a person is told nothing, and the block it guards is refused by the store's own record as well.
      active: input[fields.active] === true,
      ...(typeof transcriptPath === 'string' && transcriptPath !== '' ? { transcriptPath } : {}),
      ...(typeof lastMessage === 'string' ? { lastMessage } : {}),
    },
  };
}
