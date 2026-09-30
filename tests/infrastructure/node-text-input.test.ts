import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Readable } from 'node:stream';
import { NodeTextInput } from '../../src/infrastructure/node-text-input.ts';

test('the whole input is read, across chunks', async () => {
  assert.equal(await new NodeTextInput(Readable.from(['{"a":', '1}'])).readAll(100), '{"a":1}');
});

test('an input past the limit is not held', async () => {
  assert.equal(await new NodeTextInput(Readable.from(['x'.repeat(60), 'y'.repeat(60)])).readAll(100), undefined);
});

test('a stream that fails is an answer, not an exception', async () => {
  const failing = new Readable({
    read() {
      this.destroy(new Error('broken pipe'));
    },
  });
  assert.equal(await new NodeTextInput(failing).readAll(100), undefined);
});
