// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * What a finished call recorded (spec §2.9, CPB15): `success`, and on a call that ran, `result.content` - the text the call
 * returned, on 19 of 19 successful calls - with `result.detailedContent` beside it for `view`, `create` and `edit`, and
 * `shellExecution.exitCode` for `bash`. A `postToolUse` hook's copy of it is `result.content` or the runtime's elision
 * notice and never other text (CPB42), so `result.content` is what the call returned.
 */
export const COMPLETION = {
  success: 'success',
  result: 'result',
  content: 'content',
  detailedContent: 'detailedContent',
  shell: 'shellExecution',
  exitCode: 'exitCode',
} as const;

/**
 * The runtime's words opening a result it moved to a file (CPB26): `Output too large to read at once (<n> KB). Saved to:
 * /tmp/…`, then a preview. The file was gone minutes after the run; what follows the notice is all the record holds
 * (CP25). The size it starts at is not measured (CPO14).
 */
export const SPILL_NOTICE = 'Output too large to read at once';

/**
 * A call that ran and failed (CPB58): `success: false` with `error.code` `failure` and the tool's own words in
 * `error.message` - `view` of a path that did not exist, 1 of 1, in the desktop app's runtime 1.0.94-3. No refusal: nothing
 * stopped it, and what it reached is not established by a failure (`what-codex-wrote` X11).
 */
export const FAILED = 'failure';

/**
 * The runtime's own last line of every `bash` result (CPB47, 12 of 12): `<shellId: <n> completed with exit code <n>>`,
 * its exit code equal to `shellExecution.exitCode`. It is not what the command printed: what precedes it is.
 */
export const SHELL_TRAILER = /\n?<shellId: \d+ completed with exit code -?\d+>\s*$/;
