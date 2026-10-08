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

// Found 2026-10-08 on a Codex panel conversation whose every command was established once XD4a read the cell's exit:
// its remaining gaps were all the format's own capability records, and the row still said "1 command ran…".
test('a capability record naming its source is the AI’s own limit, never a command of this conversation', () => {
  const source = { kind: 'main' } as const;
  assert.deepEqual(gapReasons([
    { kind: 'capability-absent', question: 'access', source, agentId: 'a' },
    { kind: 'capability-absent', question: 'actions', source, agentId: 'a' },
    { kind: 'capability-unmeasured', question: 'own-words', source, agentId: 'a' },
  ]), { format: true }, 'nothing of this conversation’s is missing, so the row says the format does not write every step');

  // The same question left by a call of this conversation names no source, and is counted as before.
  assert.deepEqual(gapReasons([
    { kind: 'capability-absent', question: 'access', agentId: 'a' },
    { kind: 'capability-absent', question: 'access', source, agentId: 'a' },
  ]), { unread: 1 }, 'one call unestablished, beside a format record that is no call');

  // A source that could not be read is this conversation's gap although it names one: only capability kinds are traits.
  assert.deepEqual(gapReasons([{ kind: 'source-missing', source }]), { damaged: 1 });
});
