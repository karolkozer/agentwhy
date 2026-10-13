// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { CapabilityQuestion } from '../../../../src/core/completeness.ts';
import { MEASURED_LINE, MEASURED_PROFILES, UNMEASURED_ANSWERS } from '../../../../src/adapter/copilot/contract/capabilities.ts';
import { VERIFIED_AGAINST } from '../../../../src/adapter/copilot/contract/version.ts';
import { AGENTWHY_REFUSAL } from '../../../../src/adapter/copilot/contract/refusals.ts';
import { refusalReason } from '../../../../src/refuse/render/refusal-words.ts';

// That every label of this contract is one the reconnaissance probe measured is held beside the probe, among the research
// scripts' own tests, which stay out of the public repository.

test('the Copilot capability answers cover every question the core asks, and no other', () => {
  // A question the core adds fails to compile here until the contract answers it.
  const asked: Record<CapabilityQuestion, true> = {
    actions: true, access: true, 'output-delivery': true, 'own-words': true, reasoning: true, refusals: true, permissions: true,
  };
  const questions = Object.keys(asked).sort();
  assert.deepEqual(Object.keys(UNMEASURED_ANSWERS).sort(), questions);
  for (const profile of MEASURED_PROFILES) assert.deepEqual(Object.keys(profile.answers).sort(), questions);
});

test('only the measured builds have a profile', () => {
  assert.deepEqual(MEASURED_PROFILES.flatMap((profile) => profile.builds).sort(), [...VERIFIED_AGAINST.copilot].sort());
  assert.ok(Object.values(UNMEASURED_ANSWERS).every((answer) => answer === 'unmeasured'));
});

// CPD12: a hook's refusal is agentwhy's by refuse's own words, so the contract's copy of them is held to refuse's.
test("the words that make a hook's refusal agentwhy's are the ones refuse writes", () => {
  const reason = refusalReason('/Users/someone/shop/.env', '**/.env', 0, { kind: 'named' });
  assert.ok(reason.startsWith(AGENTWHY_REFUSAL), reason);
});

// CPD13: the measured profile covers its own line and no other.
test('every measured build is of the line the profile covers, and a new minor line is not', () => {
  for (const build of VERIFIED_AGAINST.copilot) assert.match(build, MEASURED_LINE);
  for (const build of ['1.0.96', '1.0.101-7']) assert.match(build, MEASURED_LINE);
  for (const build of ['1.1.0', '1.0', '0.67.0', '1.0.94-beta', '2.0.0']) assert.doesNotMatch(build, MEASURED_LINE);
});
