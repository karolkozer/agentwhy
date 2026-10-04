// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { refusedByOthers, refusedByRule, sumRefusedByOthers } from '../../src/report/refusals.ts';

// `.ai/specs/2026-10-01-who-stopped-it.md` WS3: who refused, counted beside the total and absent where a rule refused all.
test('refusals no rule made are counted by who made them, and a rule alone leaves nothing to count', () => {
  assert.equal(refusedByOthers([{ refusedBy: 'rule' }, {}]), undefined, 'a refusal with no source on record is a rule\'s');
  assert.deepEqual(refusedByOthers([{ refusedBy: 'rule' }, { refusedBy: 'reviewer' }, { refusedBy: 'reviewer' }, { refusedBy: 'person' }]), { reviewer: 2, person: 1 });
  assert.equal(refusedByOthers([]), undefined);
});

test('counts over several sessions or agents add up, and nothing added to nothing stays absent', () => {
  assert.deepEqual(sumRefusedByOthers([{ reviewer: 1, person: 0 }, undefined, { reviewer: 2, person: 3 }]), { reviewer: 3, person: 3 });
  assert.equal(sumRefusedByOthers([undefined, undefined]), undefined);
});

test('what a rule refused is the total less what the others did, and never below nothing', () => {
  assert.equal(refusedByRule(5, undefined), 5);
  assert.equal(refusedByRule(5, { reviewer: 2, person: 1 }), 2);
  assert.equal(refusedByRule(1, { reviewer: 2, person: 0 }), 0);
});
