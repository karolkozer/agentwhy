import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { IdentifierCollector } from '../../../../../src/adapter/claude-code/probe/collectors/identifier-collector.ts';
import { lineOf, unparsableLine } from '../../../../helpers/transcript-line.ts';

test('counts unique identifiers, including those on unparsable lines', () => {
  const collector = new IdentifierCollector();

  collector.collect(lineOf({ id: 'toolu_01AAAAAAAAAAAAAAAAAAAAAAAA', uuid: '11111111-1111-4111-8111-111111111111' }));
  collector.collect(unparsableLine('{"id":"toolu_01AAAAAAAAAAAAAAAAAAAAAAAA","next":"toolu_01BBBBBBBBBBBBBBBBBBBBBBBB'));

  assert.equal(collector.uniqueToolUseIds(), 2);
  assert.equal(collector.uniqueUuids(), 1);
});
