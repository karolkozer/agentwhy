// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { SessionModel } from './session-model.ts';

/**
 * A conversation without the one call that is asking about it (`2026-11-24-talking-about-agentwhy.md` CVB22): it is in the record and has
 * no result yet, which is no gap in what the AI did. A call that has ended, and one the record does not hold, change nothing.
 */
export function withoutOpenCall(model: SessionModel, callId: string): SessionModel {
  const asking = model.events.find((event) => event.id === callId && event.result === undefined);
  if (asking === undefined) return model;
  const gap = model.gaps.findIndex((one) => one.kind === 'result-missing' && one.agentId === asking.agentId);
  const gaps = gap < 0 ? model.gaps : model.gaps.filter((_, at) => at !== gap);
  return { ...model, events: model.events.filter((event) => event !== asking), gaps, completeness: gaps.length === 0 ? 'complete' : model.completeness };
}
