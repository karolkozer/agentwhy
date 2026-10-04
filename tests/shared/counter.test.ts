// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Counter } from '../../src/shared/counter.ts';

test('counts per key, sorted by key whatever the insertion order', () => {
  const counter = new Counter();
  for (const key of ['b', 'a', 'b', 'B']) counter.add(key);

  assert.deepEqual(Object.entries(counter.toCounts()), [
    ['B', 1],
    ['a', 1],
    ['b', 2],
  ]);
});

test('an empty counter has no counts', () => {
  assert.deepEqual(new Counter().toCounts(), {});
});
