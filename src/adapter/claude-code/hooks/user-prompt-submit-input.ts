// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { USER_PROMPT_SUBMIT } from '../contract/hooks.ts';
import { parseJsonObject } from '../../../shared/json.ts';
import type { MessageToCheck, PastedLines } from '../../../core/message/keys-to-tell.ts';
import type { UnusableInput } from './subagent-stop-input.ts';

/**
 * Claude Code's `UserPromptSubmit` input as the message a check reads (`2026-11-01-a-key-in-your-message.md` PK1): the
 * text, the folder, and the lines between each pair of the paste tags Claude Code adds (§3a). A tag left open is no paste:
 * its line numbers stay the message's own. Never throws: what cannot be used is named.
 */
export function parseUserPromptSubmitInput(text: string): { readonly message: MessageToCheck } | { readonly unusable: UnusableInput } {
  const input = parseJsonObject(text);
  if (input === undefined) return { unusable: 'not-json' };
  const { fields } = USER_PROMPT_SUBMIT;
  if (input[fields.event] !== USER_PROMPT_SUBMIT.event) return { unusable: 'another-event' };
  const prompt = input[fields.prompt];
  if (typeof prompt !== 'string') return { unusable: 'field-missing' };
  const cwd = input[fields.cwd];
  const sessionId = input[fields.sessionId];
  return {
    message: {
      text: prompt,
      ...(typeof cwd === 'string' && cwd !== '' ? { workingDirectory: cwd } : {}),
      ...(typeof sessionId === 'string' && sessionId !== '' ? { sessionId } : {}),
      pastes: pastedLines(prompt),
    },
  };
}

function pastedLines(prompt: string): readonly PastedLines[] {
  const spans: PastedLines[] = [];
  let opened: number | undefined;
  prompt.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (USER_PROMPT_SUBMIT.pasteOpens.test(trimmed)) opened = index + 2;
    else if (USER_PROMPT_SUBMIT.pasteCloses.test(trimmed) && opened !== undefined) {
      if (index >= opened) spans.push({ first: opened, last: index });
      opened = undefined;
    }
  });
  return spans;
}
