// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { refusedReach } from '../../../core/access/refusal-message.ts';
import type { DenialMarker } from '../../../core/session-records.ts';
import { isJsonObject, type JsonObject } from '../../../shared/json.ts';
import { AGENTWHY_REFUSAL, ERROR, HOOK_ERRORED, PERMISSION, REFUSAL_OPENINGS } from '../contract/refusals.ts';

/** The kind a marker is recorded with: Copilot's own `error.code`, or a fixed word where its value is not one measured. */
const DENIED = ERROR.denied;
const UNRECOGNISED = 'unrecognised';

/**
 * Who stopped a call that did not finish (`what-copilot-wrote` CP19 as amended, CPD12, `who-stopped-it` WS9). `denied`
 * with the rule's opening is a rule's; with the hook's, agentwhy's - a rule's - where `refuse`'s own sentence follows the
 * opening, and a check's otherwise. Any other opening, or any other code, is a marker this contract does not know: the
 * call's outcome is not established, and never read as a refusal or a run.
 */
export function refusalOf(completion: JsonObject): DenialMarker {
  const error = completion[ERROR.error];
  const code = isJsonObject(error) ? error[ERROR.code] : undefined;
  const message = isJsonObject(error) ? error[ERROR.message] : undefined;
  if (code !== ERROR.denied || typeof message !== 'string') return { kind: UNRECOGNISED, recognised: false };
  if (message.startsWith(REFUSAL_OPENINGS.rule)) return { kind: DENIED, recognised: true, source: 'rule' };
  // CPB61: a hook that errored or could not start - a check's refusal, whoever's hook it was.
  if (message.startsWith(HOOK_ERRORED.opening) && message.trimEnd().endsWith(HOOK_ERRORED.closing)) return { kind: DENIED, recognised: true, source: 'check' };
  if (!message.startsWith(REFUSAL_OPENINGS.check)) return { kind: DENIED, recognised: false };
  const reason = message.slice(REFUSAL_OPENINGS.check.length).trimStart();
  const agentwhys = reason.startsWith(AGENTWHY_REFUSAL) && refusedReach(reason) !== undefined;
  return { kind: DENIED, recognised: true, source: agentwhys ? 'rule' : 'check' };
}

/**
 * A person's answer to a question the runtime asked before a call (CPB34, CPB45): `cancelled` stopped it; `approved` let it
 * run, and its completion says the rest. Any other answer is not measured.
 */
export function personsAnswerOf(completed: JsonObject): 'refused' | 'approved' | 'unrecognised' {
  const result = completed[PERMISSION.result];
  const kind = isJsonObject(result) ? result[PERMISSION.kind] : undefined;
  return kind === PERMISSION.cancelled ? 'refused' : kind === PERMISSION.approved ? 'approved' : 'unrecognised';
}

export const PERSON_REFUSED: DenialMarker = { kind: PERMISSION.cancelled, recognised: true, source: 'person' };
export const ANSWER_UNRECOGNISED: DenialMarker = { kind: UNRECOGNISED, recognised: false };
