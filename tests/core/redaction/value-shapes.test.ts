// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readsAsSample } from '../../../src/core/redaction/value-shapes.ts';

// Key-shaped values are joined at run time, so that no literal in this file reads as a key to a scanner (the export's P9).
const REAL_SHAPED = [
  ['sk', 'live', 'Q7mZp2Lx9TaV4cBn8RwE3yK'].join('_'),
  ['ghp', 'R8vT2mQ9xL4zN7pK3wB6yC1dF5hJ0sA2'].join('_'),
  'AKIA' + 'Q7MZP2LX9TAV4CBN',
  ['Zr8q', 'Lm2vX9'].join(''),
  'hunter2-but-longer-9',
];

test('a value of a real key\'s shape does not read as a sample (PKD4: it must still be stopped)', () => {
  for (const value of REAL_SHAPED) assert.equal(readsAsSample(value), false, value.slice(0, 4));
});

test('a value written as a sample reads as one', () => {
  for (const value of [
    'AKIA' + 'IOSFODNN7EXAMPLE',
    ['sk', 'live', 'fake0Q7mZp2Lx9TaV'].join('_'),
    ['ghp', 'DummyTokenForTheDocs00001'].join('_'),
    ['sk', 'live', 'YourKeyHereQ7mZp2'].join('_'),
    'your-api-key',
    'placeholder',
    'REDACTED',
  ]) assert.equal(readsAsSample(value), true, value);
});

test('a value already cut out reads as a sample: nothing of a key is left in it', () => {
  for (const value of ['…', '...', '***', '****', 'xxxx', 'XXXXXXXX', '<password>', '${DB_PASSWORD}', '$DB_PASSWORD', '%DB_PASSWORD%', '{{ db_password }}', 'password', 'secret', '00000000', '"…"']) {
    assert.equal(readsAsSample(value), true, value);
  }
});

test('a run of a character shorter than eight, or three x, is a value like any other', () => {
  assert.equal(readsAsSample('Ab0000cdEf'), false);
  assert.equal(readsAsSample('maxxed-out-9k2'), false);
});
