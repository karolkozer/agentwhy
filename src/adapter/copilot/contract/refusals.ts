// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * A call that did not run, by who stopped it (spec §2.10, §2.15; CP19, `who-stopped-it`).
 *
 * A check or a rule: `tool.execution_complete` with `success: false` and `error.code` `denied`, whose `error.message`
 * opens with the runtime's own words for the source (CPB18: a hook 5 times, a rule once). A hook that refused by exit 2
 * is recorded in those words alone; `hook.end.data.output` is keyed by the call's `toolCallId` and holds the same words (5
 * of 5). A hook that answered in JSON with a reason has it recorded after the opening, and in `hook.end.data.output`
 * (CPB44, 7 of 7).
 */
export const ERROR = { error: 'error', code: 'code', message: 'message', denied: 'denied' } as const;

export const REFUSAL_OPENINGS = {
  check: 'Denied by preToolUse hook:',
  rule: 'Permission to run this tool was denied due to the following rules:',
} as const;

/**
 * The runtime's words for a hook that errored or could not start (CPB61, 3 of 3: exit 1, a command not found):
 * `Denied by preToolUse hook from "<the hook's file>" (hook errored)`. The call was refused, by a check, and no reason of the
 * hook's own is recorded.
 */
export const HOOK_ERRORED = { opening: 'Denied by preToolUse hook from ', closing: '(hook errored)' } as const;

/**
 * agentwhy's own words, where `refuse` answered a hook in JSON (CB15, CPB44): they follow the check's opening, and only
 * they make a hook's refusal agentwhy's (CPD12). They are `refuse`'s (`src/refuse/render/refusal-words.ts`), not Copilot's;
 * a test holds the two together. Any other hook's refusal is a check's (`who-stopped-it` WS9).
 */
export const AGENTWHY_REFUSAL = 'agentwhy refused this command: ';

/**
 * A person, in the CLI's interactive mode (CPB34, 1 refusal): `permission.requested` names the call by
 * `permissionRequest.toolCallId` and a `requestId`; `permission.completed` carries both and `result.kind` `cancelled`; the
 * call has no completion, and `abort` with `reason` `user_initiated` ends the turn. A refusal that lets the turn go on is
 * not measured.
 */
export const PERMISSION = {
  requestId: 'requestId',
  request: 'permissionRequest',
  callId: 'toolCallId',
  result: 'result',
  kind: 'kind',
  cancelled: 'cancelled',
  /** A person said Yes (CPB45). */
  approved: 'approved',
  /** What `permissionRequest.kind` says where a hook asked the person (CPB45), as `shell` says the runtime did (CPB34). */
  askedByHook: 'hook',
} as const;

export const ABORT = { reason: 'reason', byPerson: 'user_initiated' } as const;
