// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { completenessOf, type Gap } from '../../src/core/completeness.ts';

test('no gaps is complete', () => {
  assert.equal(completenessOf([]), 'complete');
});

test('a gap that can be named leaves the picture partial, not whole', () => {
  const gaps: Gap[] = [{ kind: 'result-missing', agentId: 'a1' }, { kind: 'spilled-result-missing' }];

  assert.equal(completenessOf(gaps), 'partial');
});

// An unjoined relation outranks the rest: per §4.3 rule 6 the event gets no outcome at all, so the model must not
// present itself as merely incomplete.
test('an unresolved relation outranks every other gap', () => {
  const gaps: Gap[] = [{ kind: 'record-damaged' }, { kind: 'relation-unresolved', agentId: 'a1' }];

  assert.equal(completenessOf(gaps), 'unresolved');
  assert.equal(completenessOf([{ kind: 'relation-unresolved' }]), 'unresolved');
});
