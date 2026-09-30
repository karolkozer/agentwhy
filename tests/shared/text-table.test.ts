import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { countsTable, table } from '../../src/shared/text-table.ts';

test('aligns labels into one column', () => {
  assert.deepEqual(table([['a', '1'], ['long', '2']], 2), ['  a     1', '  long  2']);
});

test('lists counts largest first, ties by key, with numbers right-aligned', () => {
  assert.deepEqual(countsTable({ b: 5, a: 5, c: 10 }, 0), ['c  10', 'a   5', 'b   5']);
});

test('shows empty counts as (none)', () => {
  assert.deepEqual(countsTable({}, 4), ['    (none)']);
});
