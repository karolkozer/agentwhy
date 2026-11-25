// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ToolEvent } from '../../src/core/event.ts';
import type { SessionModel } from '../../src/core/session-model.ts';
import { withoutOpenCall } from '../../src/core/without-open-call.ts';

// `specs/2026-11-24-talking-about-agentwhy.md` CVB22: the call that asks is in the record, and is no gap in it.

const event = (id: string, ended: boolean, agentId = 'main'): ToolEvent => ({ id, agentId, ...(ended ? { result: { stage: 'model' } } : {}) }) as unknown as ToolEvent;
const model = (events: ToolEvent[], gaps: SessionModel['gaps']): SessionModel => ({ events, gaps, completeness: gaps.length === 0 ? 'complete' : 'partial' }) as unknown as SessionModel;
const missing = (agentId = 'main') => ({ kind: 'result-missing' as const, agentId });

test('the call that asks is left out with the one gap it is', () => {
  const left = withoutOpenCall(model([event('a', true), event('asking', false)], [missing()]), 'asking');
  assert.deepEqual([left.events.map((one) => one.id), left.gaps, left.completeness], [['a'], [], 'complete']);
});

test('another call with no result stays a gap, and one of another agent is never taken for it', () => {
  const two = withoutOpenCall(model([event('cut', false), event('asking', false)], [missing(), missing()]), 'asking');
  assert.deepEqual([two.events.length, two.gaps.length, two.completeness], [1, 1, 'partial']);
  const helper = withoutOpenCall(model([event('cut', false, 'h'), event('asking', false)], [missing('h'), missing()]), 'asking');
  assert.deepEqual(helper.gaps, [missing('h')]);
});

test('a call that ended, and one that is not there, change nothing', () => {
  const whole = model([event('a', true)], []);
  assert.equal(withoutOpenCall(whole, 'a'), whole);
  assert.equal(withoutOpenCall(whole, 'b'), whole);
});
