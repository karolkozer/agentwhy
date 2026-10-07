// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { gapReasons } from '../../src/report/gap-reasons.ts';

// The maintainer, 2026-10-07: why a conversation could not be checked fully, counted as its row says it.
test('a record’s gaps are counted by the reason a person is told, the AI’s own limits apart', () => {
  assert.equal(gapReasons([]), undefined);
  assert.deepEqual(gapReasons([
    { kind: 'capability-absent', question: 'access' }, { kind: 'result-incomplete' }, { kind: 'result-missing' },
    { kind: 'spilled-result-missing' }, { kind: 'record-damaged' }, { kind: 'source-missing' }, { kind: 'relation-unresolved', question: 'own-words' },
    { kind: 'capability-absent', question: 'actions' }, { kind: 'capability-unmeasured', question: 'output-delivery' },
  ]), { unread: 1, unsure: 1, noResult: 2, damaged: 2, unlinked: 1 });
  assert.deepEqual(gapReasons([{ kind: 'capability-absent', question: 'refusals' }, { kind: 'capability-unmeasured', question: 'own-words' }]), { format: true });
});
