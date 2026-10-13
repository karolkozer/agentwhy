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

// WS9: a check whose owner the record does not name is counted as one, and never credited to a rule.
test('a check of no named owner is counted beside the others, and a count without one keeps its shape', () => {
  assert.deepEqual(refusedByOthers([{ refusedBy: 'rule' }, { refusedBy: 'check' }, { refusedBy: 'check' }]), { reviewer: 0, person: 0, check: 2 });
  assert.deepEqual(refusedByOthers([{ refusedBy: 'person' }]), { reviewer: 0, person: 1 }, 'no check, no key: older counts read as they did');
  assert.deepEqual(sumRefusedByOthers([{ reviewer: 1, person: 0 }, { reviewer: 0, person: 0, check: 2 }]), { reviewer: 1, person: 0, check: 2 });
  assert.equal(refusedByRule(5, { reviewer: 1, person: 0, check: 2 }), 2);
  assert.equal(refusedByRule(2, { reviewer: 0, person: 0, check: 2 }), 0, 'a check alone leaves no rule to have held');
});
