import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DenialKindCollector } from '../../../../../src/adapter/claude-code/probe/collectors/denial-kind-collector.ts';
import { lineOf, unparsableLine } from '../../../../helpers/transcript-line.ts';

test('counts denial kinds and flags unknown ones, ignoring lines without the marker', () => {
  const collector = new DenialKindCollector();

  for (const json of [
    { toolDenialKind: 'permission-rule' },
    { toolDenialKind: 'sandbox-rule' },
    { toolDenialKind: 'sandbox-rule' },
    { type: 'user' },
  ]) {
    collector.collect(lineOf(json));
  }
  collector.collect(unparsableLine('{"toolDenialKind":"x'));

  assert.deepEqual(collector.stats(), {
    byKind: { 'permission-rule': 1, 'sandbox-rule': 2 },
    unknownKinds: ['sandbox-rule'],
  });
});
