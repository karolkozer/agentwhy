// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { LineTypeCollector } from '../../../../../src/adapter/claude-code/probe/collectors/line-type-collector.ts';
import { ABSENT_LABEL } from '../../../../../src/shared/label.ts';
import { lineOf, unparsableLine } from '../../../../helpers/transcript-line.ts';

test('counts line types, flags the unknown ones and counts system subtypes', () => {
  const collector = new LineTypeCollector();

  for (const json of [{ type: 'user' }, { type: 'user' }, { type: 'system', subtype: 'stop_hook_summary' }, { type: 'mode' }, {}]) {
    collector.collect(lineOf(json));
  }
  collector.collect(unparsableLine('{"type":"assistant"'));

  assert.deepEqual(collector.lineTypes(), { [ABSENT_LABEL]: 1, mode: 1, system: 1, user: 2 });
  assert.deepEqual(collector.unknownLineTypes(), [ABSENT_LABEL, 'mode']);
  assert.deepEqual(collector.systemSubtypes(), { stop_hook_summary: 1 });
});
