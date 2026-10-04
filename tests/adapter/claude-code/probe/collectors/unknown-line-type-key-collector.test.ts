// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { UnknownLineTypeKeyCollector } from '../../../../../src/adapter/claude-code/probe/collectors/unknown-line-type-key-collector.ts';
import { ABSENT_LABEL, INVALID_LABEL } from '../../../../../src/shared/label.ts';
import { lineOf, unparsableLine } from '../../../../helpers/transcript-line.ts';

test('counts top-level keys per unknown line type, and ignores known types', () => {
  const collector = new UnknownLineTypeKeyCollector();

  for (const json of [
    { type: 'user', message: {} },
    { type: 'mode', mode: 'x', sessionId: 's' },
    { type: 'mode', mode: 'y' },
    { type: 'history-suppression', 'CANARY key with spaces': true },
    { type: 'bridge-session', bridgeSessionId: 'b' },
    { isSidechain: true },
  ]) {
    collector.collect(lineOf(json));
  }
  collector.collect(unparsableLine('{"type":"mode"'));

  assert.deepEqual(collector.keysByType(), {
    [ABSENT_LABEL]: { isSidechain: 1 },
    'history-suppression': { [INVALID_LABEL]: 1, type: 1 },
    mode: { mode: 2, sessionId: 1, type: 2 },
  });
});
