// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { SUBAGENT_STOP } from '../contract/hooks.ts';
import { parseJsonObject } from '../../../shared/json.ts';

/** What `watch` needs from a `SubagentStop` input, in the core's terms. */
export interface FinishedAgent {
  /** The main session's transcript, which names the session to read. */
  readonly transcriptPath: string;
  readonly agentId: string;
  readonly lastMessage?: string;
  /** What an alert is remembered under until the turn ends. Absent where the input did not carry it. */
  readonly sessionId?: string;
  /** The agent's own file, which tells an agent that kept no record from one not found (B4g). Absent where not named. */
  readonly agentTranscriptPath?: string;
}

/** Why an input could not be used. Named, so the alert can say it was not checked rather than stay silent. */
export type UnusableInput = 'not-json' | 'another-event' | 'field-missing';

/** Reads the text a hook was given on standard input. Never throws: an input it cannot use is a named answer. */
export function parseSubagentStopInput(text: string): { readonly agent: FinishedAgent } | { readonly unusable: UnusableInput } {
  const input = parseJsonObject(text);
  if (input === undefined) return { unusable: 'not-json' };

  const { fields } = SUBAGENT_STOP;
  if (input[fields.event] !== SUBAGENT_STOP.event) return { unusable: 'another-event' };

  const transcriptPath = input[fields.transcriptPath];
  const agentId = input[fields.agentId];
  if (typeof transcriptPath !== 'string' || transcriptPath === '' || typeof agentId !== 'string' || agentId === '') {
    return { unusable: 'field-missing' };
  }

  const lastMessage = input[fields.lastMessage];
  const sessionId = input[fields.sessionId];
  const agentTranscriptPath = input[fields.agentTranscriptPath];
  return {
    agent: {
      transcriptPath,
      agentId,
      ...(typeof lastMessage === 'string' ? { lastMessage } : {}),
      ...(typeof sessionId === 'string' && sessionId !== '' ? { sessionId } : {}),
      ...(typeof agentTranscriptPath === 'string' && agentTranscriptPath !== '' ? { agentTranscriptPath } : {}),
    },
  };
}
