// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { USER_PROMPT_SUBMIT } from '../contract/hooks.ts';
import { parseJsonObject } from '../../../shared/json.ts';
import type { MessageToCheck } from '../../../core/message/keys-to-tell.ts';
import type { CodexStopUnusable } from './stop-input.ts';

/**
 * Codex's `UserPromptSubmit` input as the message a check reads (`2026-11-01-a-key-in-your-message.md` PK1). Codex marks
 * no paste (§3a), so every line is the message's. Never throws: what cannot be used is named.
 */
export function parseCodexUserPromptSubmitInput(text: string): { readonly message: MessageToCheck } | { readonly unusable: CodexStopUnusable } {
  const input = parseJsonObject(text);
  if (input === undefined) return { unusable: 'not-json' };
  const { fields } = USER_PROMPT_SUBMIT;
  if (input[fields.event] !== USER_PROMPT_SUBMIT.event) return { unusable: 'another-event' };
  const prompt = input[fields.prompt];
  if (typeof prompt !== 'string') return { unusable: 'field-missing' };
  const cwd = input[fields.cwd];
  const sessionId = input[fields.sessionId];
  return { message: { text: prompt, ...(typeof cwd === 'string' && cwd !== '' ? { workingDirectory: cwd } : {}),
      ...(typeof sessionId === 'string' && sessionId !== '' ? { sessionId } : {}), pastes: [] } };
}
