// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * A command a `PreToolUse` hook refused (`codex-blocks-too` CKB3, CKB7, CKB11): it never runs, so no item records it, and
 * the one trace is text in the code cell's output - "Script error:\nCommand blocked by PreToolUse hook: <reason>.
 * Command: <line>". Measured on 0.159.2 (the terminal app and `codex exec`) and `codex exec` 0.155.0-alpha.16.3. No field
 * types it (XB1): only a reason agentwhy wrote itself is read as a refusal, since its words are agentwhy's and not Codex's.
 */
export const HOOK_REFUSAL = {
  /** Codex's words before a hook's reason. */
  blocked: 'Command blocked by PreToolUse hook: ',
  /** Codex's words between the reason and the refused line. */
  command: '. Command: ',
  /** The kind a refusal read from agentwhy's own reason is recorded with. */
  denialKind: 'agentwhy refuse',
} as const;
