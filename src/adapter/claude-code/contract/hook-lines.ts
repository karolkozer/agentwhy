// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * What a transcript keeps of a hook's words to the AI (`2026-11-05-a-key-in-what-it-read.md` §2.1). Measured on
 * Claude Code 2.1.308 with `claude -p`: an `attachment` line of type `hook_additional_context`, its `content` a list of the
 * hook's texts, `toolUseID` the call it answered and `hookEvent` the event - beside `hook_success` and `hook_system_message` for
 * the same call. Correlated by that id, never by time.
 */
export const HOOK_CONTEXT_LINE = {
  lineType: 'attachment',
  attachment: 'attachment',
  type: 'type',
  kind: 'hook_additional_context',
  content: 'content',
  toolUseId: 'toolUseID',
  hookEvent: 'hookEvent',
  afterACall: 'PostToolUse',
} as const;
